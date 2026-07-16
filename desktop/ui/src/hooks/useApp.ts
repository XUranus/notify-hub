import { useState, useCallback, useEffect, useRef } from 'react'
import { listen } from '@tauri-apps/api/event'
import { detectLang, getTranslations, type Locale, type Translations } from '../lib/i18n'
import {
  TOAST_TIMEOUT_MS,
  UNDO_TIMEOUT_MS,
  STATUS_CHECK_INTERVAL_MS,
  NEW_MESSAGE_CHECK_INTERVAL_MS,
  REFRESH_INTERVAL_MS,
} from '../lib/constants'

// ── Tauri invoke ──
const invoke = window.__TAURI_INTERNALS__.invoke as (cmd: string, args?: Record<string, unknown>) => Promise<any>

// ── Types ──
export interface Message {
  id: string; title: string; body: string; level: string; read: boolean; flagged: boolean
  tags: string | null; channel: string | null; topic_id: string | null; topic_name: string | null
  topic_display_name: string | null; topic_description: string | null; topic_icon: string | null; url: string | null
  attachment: string | null; format: string | null; priority: string | null
  received_at: string; client_uuid: string | null
}

export interface TopicGroup {
  key: string; topicId: string | null; topicName: string | null
  topicDisplayName: string | null; topicDescription: string | null; topicIcon: string | null; messages: Message[]
}

// ── Constants ──
const MSG_HEIGHT = 72
const TOPIC_CARD_HEIGHT = 110
const COLOR_SCHEMES = ['purple', 'blue', 'teal', 'green', 'orange', 'rose']

export function useApp() {
  // ── i18n ──
  const [lang, setLangState] = useState<Locale>(detectLang)
  const [T, setT] = useState<Translations>(() => getTranslations(detectLang()))

  const setLang = useCallback((l: Locale) => {
    setLangState(l); setT(getTranslations(l)); localStorage.setItem('nh_lang', l)
    document.documentElement.lang = l
    invoke('set_language', { language: l }).catch(() => {})
  }, [])

  // ── Theme ──
  const [theme, setThemeState] = useState<string>(() => localStorage.getItem('nh_theme') || 'system')
  const [colorScheme, setColorSchemeState] = useState<string>(() => localStorage.getItem('nh_color_scheme') || 'purple')

  const setTheme = useCallback((t: string) => {
    setThemeState(t); localStorage.setItem('nh_theme', t)
    const root = document.documentElement; root.classList.remove('light', 'dark')
    if (t === 'dark') root.classList.add('dark'); else if (t === 'light') root.classList.add('light')
  }, [])

  const setColorScheme = useCallback((s: string) => {
    setColorSchemeState(s); localStorage.setItem('nh_color_scheme', s || 'purple')
    const root = document.documentElement; COLOR_SCHEMES.forEach(cs => root.classList.remove(cs))
    if (s && s !== 'purple') root.classList.add(s)
  }, [])

  // Apply theme on mount
  useEffect(() => { setTheme(theme); setColorScheme(colorScheme) }, [])

  // ── Font Settings ──
  const FONT_SIZES = ['12', '13', '14', '15', '16', '18', '20']
  const FONT_FAMILIES = [
    { label: 'System', value: '' },
    { label: 'Sans-serif', value: 'system-ui, -apple-system, sans-serif' },
    { label: 'Serif', value: 'Georgia, "Times New Roman", serif' },
    { label: 'Monospace', value: '"SF Mono", "Fira Code", "Cascadia Code", monospace' },
  ]
  const [fontSize, setFontSizeState] = useState<string>(() => localStorage.getItem('nh_font_size') || '14')
  const [fontFamily, setFontFamilyState] = useState<string>(() => localStorage.getItem('nh_font_family') || '')

  const applyFont = useCallback((size: string, family: string) => {
    const root = document.documentElement
    root.style.setProperty('--app-font-size', size + 'px')
    if (family) {
      root.style.setProperty('--app-font-family', family)
    } else {
      root.style.removeProperty('--app-font-family')
    }
  }, [])

  const setFontSize = useCallback((s: string) => {
    setFontSizeState(s); localStorage.setItem('nh_font_size', s)
    applyFont(s, fontFamily)
  }, [fontFamily, applyFont])

  const setFontFamily = useCallback((f: string) => {
    setFontFamilyState(f); localStorage.setItem('nh_font_family', f)
    applyFont(fontSize, f)
  }, [fontSize, applyFont])

  useEffect(() => { applyFont(fontSize, fontFamily) }, [])

  // ── Toast ──
  const [toast, setToast] = useState({ text: '', type: 'info' as string, visible: false })
  const toastTimer = useRef<number | null>(null)

  const showToast = useCallback((text: string, type = 'info') => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast({ text, type, visible: true })
    toastTimer.current = window.setTimeout(() => setToast(prev => ({ ...prev, visible: false })), TOAST_TIMEOUT_MS)
  }, [])

  // ── View State ──
  const [currentView, setCurrentView] = useState<'connect' | 'dashboard'>('connect')
  const [viewMode, setViewMode] = useState<string>(() => localStorage.getItem('viewMode') || 'messages')
  const [offlineMode, setOfflineMode] = useState(false)
  const [clientUuid, setClientUuid] = useState<string>('')

  const toggleViewMode = useCallback(() => {
    const modes = ['messages', 'topics', 'cards']
    const currentIndex = modes.indexOf(viewMode)
    const newMode = modes[(currentIndex + 1) % modes.length]
    setViewMode(newMode)
    localStorage.setItem('viewMode', newMode)
  }, [viewMode, setViewMode])

  // ── DND State ──
  const [dndActive, setDndActive] = useState(false)

  // Check DND status periodically
  useEffect(() => {
    const check = async () => {
      try {
        const until = await invoke('get_dnd')
        if (until === 0) { setDndActive(false); return }
        if (until === -1) { setDndActive(true); return }
        setDndActive(Date.now() < until)
      } catch {}
    }
    check()
    const timer = setInterval(check, 30000) // check every 30s
    return () => clearInterval(timer)
  }, [invoke])

  // ── Messages State ──
  const [allMessages, setAllMessages] = useState<Message[]>([])
  const allMessagesRef = useRef<Message[]>([])
  // Keep ref in sync
  useEffect(() => { allMessagesRef.current = allMessages }, [allMessages])
  const [currentFilter, setCurrentFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [selectMode, setSelectMode] = useState(false)
  const lastDeletedRef = useRef<{ msg: Message; idx: number } | null>(null)
  const [lastDeletedTick, setLastDeletedTick] = useState(0)
  const lastDeleted = lastDeletedRef.current
  const undoTimer = useRef<number | null>(null)

  // ── Detail State ──
  const [detailMsg, setDetailMsg] = useState<Message | null>(null)

  // ── Topic State ──
  const [topicDetailKey, setTopicDetailKey] = useState<string | null>(null)

  // ── Modal State ──
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [composeOpen, setComposeOpen] = useState(false)
  const [quickSendOpen, setQuickSendOpen] = useState(false)
  const [offlineOpen, setOfflineOpen] = useState(false)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [deleteModalText, setDeleteModalText] = useState('')
  const [deleteModalCallback, setDeleteModalCallback] = useState<(() => void) | null>(null)
  const [errorDetailOpen, setErrorDetailOpen] = useState(false)

  // ── Connection State ──
  const [connStatus, setConnStatus] = useState({ text: '—', connected: false })

  // ── Helpers ──
  const escHtml = useCallback((s: string) => { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML }, [])

  const formatRelativeTime = useCallback((dateStr: string) => {
    try {
      const date = new Date(dateStr.replace(' ', 'T'))
      if (isNaN(date.getTime())) return dateStr || ''
      const diff = Date.now() - date.getTime()
      if (diff < 60000) return T.justNow
      if (diff < 3600000) return Math.floor(diff / 60000) + ' ' + T.minAgo
      if (diff < 86400000) return Math.floor(diff / 3600000) + ' ' + T.hrAgo
      if (diff < 2592000000) return Math.floor(diff / 86400000) + ' ' + T.daysAgo
      const m = date.getMonth() + 1, d = date.getDate()
      return (m < 10 ? '0' : '') + m + '/' + (d < 10 ? '0' : '') + d
    } catch { return dateStr || '' }
  }, [T])

  const parseTags = useCallback((m: Message): string[] => {
    try { if (m.tags) { const t = JSON.parse(m.tags); return Array.isArray(t) ? t : [] } } catch {} return []
  }, [])

  const parseAttachment = useCallback((m: Message) => {
    try { if (m.attachment) return JSON.parse(m.attachment) } catch {} return null
  }, [])

  // ── Filtered Messages ──
  const getFilteredMessages = useCallback(() => {
    return allMessages.filter(m => {
      const matchesSearch = !searchQuery || (m.title || '').toLowerCase().includes(searchQuery) || (m.body || '').toLowerCase().includes(searchQuery)
      const matchesFilter = currentFilter === 'all' || (currentFilter === 'unread' && !m.read) || (currentFilter === 'read' && m.read) || (currentFilter === 'flagged' && m.flagged)
      return matchesSearch && matchesFilter
    })
  }, [allMessages, searchQuery, currentFilter])

  // ── Topic Grouping ──
  const groupMessagesByTopic = useCallback((messages: Message[]): TopicGroup[] => {
    const groups = new Map<string, TopicGroup>()
    for (const m of messages) {
      const key = m.topic_id || '__no_topic__'
      if (!groups.has(key)) {
        groups.set(key, { key, topicId: m.topic_id || null, topicName: m.topic_name || null, topicDisplayName: m.topic_display_name || null, topicDescription: m.topic_description || null, topicIcon: m.topic_icon || null, messages: [] })
      }
      groups.get(key)!.messages.push(m)
    }
    const arr = Array.from(groups.values())
    arr.sort((a, b) => {
      if (!a.topicId && b.topicId) return 1; if (a.topicId && !b.topicId) return -1
      return (b.messages[0]?.received_at || '').localeCompare(a.messages[0]?.received_at || '')
    })
    for (const g of arr) g.messages.sort((a, b) => (b.received_at || '').localeCompare(a.received_at || ''))
    for (const g of arr) {
      const unread = g.messages.filter((m: Message) => !m.read).length
      const total = g.messages.length
      ;(g as any).unreadCount = unread
      ;(g as any).totalCount = total
    }
    return arr
  }, [])

  // ── New Message ID tracking (for msg-new animation) ──
  const [newMsgIds, setNewMsgIds] = useState<Set<string>>(new Set())
  const newMsgTimer = useRef<number | null>(null)

  // ── Message Actions ──
  const refreshMessages = useCallback(async () => {
    try {
      const oldIds = new Set(allMessagesRef.current.map((m: Message) => m.id))
      const msgs = await invoke('get_messages')
      setAllMessages(msgs || [])
      // Update tray unread count
      const unread = (msgs || []).filter((m: Message) => !m.read).length
      invoke('update_tray_unread', { count: unread })
      const fresh = new Set<string>()
      for (const m of (msgs || [])) { if (!oldIds.has(m.id)) fresh.add(m.id) }
      if (fresh.size > 0) {
        setNewMsgIds(fresh)
        if (newMsgTimer.current) clearTimeout(newMsgTimer.current)
        newMsgTimer.current = window.setTimeout(() => setNewMsgIds(new Set()), 500)
      }
    } catch {}
  }, [])

  const markAsRead = useCallback(async (id: string) => {
    await invoke('mark_as_read', { id })
    setAllMessages(prev => prev.map(m => m.id === id ? { ...m, read: true } : m))
  }, [])

  const toggleFlag = useCallback(async (id: string) => {
    await invoke('toggle_flag', { id })
    setAllMessages(prev => prev.map(m => m.id === id ? { ...m, flagged: !m.flagged } : m))
  }, [])

  const deleteWithUndo = useCallback(async (id: string) => {
    const idx = allMessages.findIndex(m => m.id === id); const msg = allMessages[idx]; if (!msg) return
    await invoke('delete_message_undo', { id })
    setAllMessages(prev => prev.filter(m => m.id !== id))
    const entry = { msg, idx }
    lastDeletedRef.current = entry
    setLastDeletedTick(t => t + 1)
    if (undoTimer.current) clearTimeout(undoTimer.current)
    undoTimer.current = window.setTimeout(() => { lastDeletedRef.current = null; setLastDeletedTick(t => t + 1) }, UNDO_TIMEOUT_MS)
  }, [allMessages, T, showToast])

  const undoDelete = useCallback(async () => {
    const entry = lastDeletedRef.current
    if (!entry) return
    if (undoTimer.current) { clearTimeout(undoTimer.current); undoTimer.current = null }
    lastDeletedRef.current = null
    setLastDeletedTick(t => t + 1)
    await invoke('insert_message', { msg: entry.msg, index: entry.idx })
    refreshMessages()
  }, [refreshMessages])

  const markAllRead = useCallback(async (topicId?: string) => {
    const targets = topicId
      ? allMessages.filter(m => (m.topic_id || '__no_topic__') === topicId && !m.read)
      : allMessages.filter(m => !m.read)
    for (const m of targets) { await invoke('mark_as_read', { id: m.id }) }
    if (topicId) {
      setAllMessages(prev => prev.map(m => (m.topic_id || '__no_topic__') === topicId ? { ...m, read: true } : m))
    } else {
      setAllMessages(prev => prev.map(m => ({ ...m, read: true })))
    }
  }, [allMessages])

  const clearAll = useCallback(async () => {
    await invoke('clear_messages'); setAllMessages([])
  }, [])

  const deleteSelected = useCallback(async () => {
    const ids = Array.from(selectedIds)
    for (const id of ids) await invoke('delete_message', { id })
    setSelectedIds(new Set()); setSelectMode(false); refreshMessages()
  }, [selectedIds, refreshMessages])

  const deleteTopic = useCallback(async (topicId: string) => {
    try { await invoke('delete_topic', { id: topicId }) } catch { /* topic may already be gone on server */ }
    const ids = allMessages.filter(m => m.topic_id === topicId).map(m => m.id)
    for (const id of ids) await invoke('delete_message', { id })
    setAllMessages(prev => prev.filter(m => m.topic_id !== topicId))
    setTopicDetailKey(null)
  }, [allMessages])

  const clearTopicMessages = useCallback(async (topicId: string) => {
    const ids = allMessages.filter(m => m.topic_id === topicId).map(m => m.id)
    for (const id of ids) await invoke('delete_message', { id })
    setAllMessages(prev => prev.filter(m => m.topic_id !== topicId))
  }, [allMessages])

  // ── Delete Modal ──
  const showDeleteConfirm = useCallback((text: string, callback: () => void) => {
    setDeleteModalText(text); setDeleteModalCallback(() => callback); setDeleteModalOpen(true)
  }, [])

  // ── Connect ──
  const handleConnect = useCallback(async (url: string, username: string, password: string) => {
    const cfg = await invoke('get_config')
    const newCfg = {
      server: { url, username, password, jwt: '' },
      client: { uuid: cfg.client.uuid, name: cfg.client.name },
      autostart: cfg.autostart || false, auto_download_images: cfg.auto_download_images || false,
      connection_mode: cfg.connection_mode || 'sse'
    }
    await invoke('save_config', { cfg: newCfg })
    // Save to localStorage for auto-fill on next login
    localStorage.setItem('serverUrl', url)
    localStorage.setItem('username', username)
    await invoke('reconnect')
    setCurrentView('dashboard'); refreshMessages()
  }, [refreshMessages])

  // ── Status Polling + Tray Update ──
  useEffect(() => {
    if (currentView !== 'dashboard') return
    let wasConnected = false; let dialogShown = false
    const timer = setInterval(async () => {
      try {
        const state = await invoke('get_poll_state')
        if (state.error) {
          setConnStatus({ text: state.error, connected: false })
          invoke('update_tray_status', { connected: false, mode: state.mode, error: state.error })
          if (wasConnected && !dialogShown) { setOfflineOpen(true); dialogShown = true }
        } else {
          wasConnected = true; dialogShown = false
          setOfflineOpen(false)
          setOfflineMode(false)
          const mode = state.mode || 'sse'
          const label = mode === 'sse' ? 'SSE' : mode === 'ws' ? 'WS' : 'Poll'
          setConnStatus({ text: label, connected: true })
          invoke('update_tray_status', { connected: true, mode, error: null })
        }
      } catch {}
    }, STATUS_CHECK_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [currentView])

  // ── Refresh on mount + listen ──
  useEffect(() => {
    const init = async () => {
      try {
        const cfg = await invoke('get_config')
        if (cfg?.client?.uuid) setClientUuid(cfg.client.uuid)
        if (cfg?.server?.jwt) { setCurrentView('dashboard'); refreshMessages(); return }
        if (cfg?.server?.url) { /* pre-fill connect form */ }
      } catch {}
      setCurrentView('connect')
    }
    init()
    let unlisten: (() => void) | null = null
    listen('messages-updated', () => { refreshMessages() }).then(fn => { unlisten = fn })
    // Poll for new messages via drain_has_new flag (set by Rust when messages arrive)
    const checkNewTimer = setInterval(async () => {
      try {
        const hasNew = await invoke('drain_has_new')
        if (hasNew) refreshMessages()
      } catch {}
    }, NEW_MESSAGE_CHECK_INTERVAL_MS)
    // Also refresh periodically to sync read/flag state
    const refreshTimer = setInterval(() => { if (currentView === 'dashboard') refreshMessages() }, REFRESH_INTERVAL_MS)
    return () => { if (unlisten) unlisten(); clearInterval(checkNewTimer); clearInterval(refreshTimer) }
  }, [])

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (deleteModalOpen) { setDeleteModalOpen(false); return }
      if (composeOpen) { setComposeOpen(false); return }
      if (quickSendOpen) { setQuickSendOpen(false); return }
      if (offlineOpen) { setOfflineOpen(false); setOfflineMode(true); return }
      if (detailMsg) { setDetailMsg(null); return }
      if (settingsOpen) { setSettingsOpen(false); return }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [deleteModalOpen, composeOpen, quickSendOpen, offlineOpen, detailMsg, settingsOpen])

  // ── Expose global functions for tray menu ──
  useEffect(() => {
    (window as any).__reconnect = async () => {
      try { await invoke('reconnect'); refreshMessages() } catch {}
    }
    return () => { delete (window as any).__reconnect }
  }, [refreshMessages])

  return {
    // i18n
    lang, T, setLang,
    // Theme
    theme, colorScheme, setTheme, setColorScheme, colorSchemes: COLOR_SCHEMES,
    // Font
    fontSize, fontFamily, setFontSize, setFontFamily, fontSizes: FONT_SIZES, fontFamilies: FONT_FAMILIES,
    // Toast
    toast, showToast,
    // View
    currentView, setCurrentView, viewMode, setViewMode, toggleViewMode, offlineMode,
    // Messages
    allMessages, currentFilter, searchQuery, showSearch, selectedIds, selectMode, lastDeleted, newMsgIds,
    detailMsg, topicDetailKey,
    setCurrentFilter, setSearchQuery, setShowSearch, setSelectedIds, setSelectMode, setDetailMsg, setTopicDetailKey,
    // Actions
    refreshMessages, markAsRead, toggleFlag, deleteWithUndo, undoDelete, markAllRead, clearAll, deleteSelected, deleteTopic, clearTopicMessages,
    // Helpers
    escHtml, formatRelativeTime, parseTags, parseAttachment, getFilteredMessages, groupMessagesByTopic,
    // Constants
    MSG_HEIGHT, TOPIC_CARD_HEIGHT,
    // Modals
    settingsOpen, setSettingsOpen, composeOpen, setComposeOpen, quickSendOpen, setQuickSendOpen,
    offlineOpen, setOfflineOpen, deleteModalOpen, setDeleteModalOpen, deleteModalText, deleteModalCallback,
    errorDetailOpen, setErrorDetailOpen,
    showDeleteConfirm,
    // Connection
    connStatus, handleConnect,
    // Client
    clientUuid,
    // DND
    dndActive,
    // Tauri
    invoke,
  }
}
