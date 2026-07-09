import React, { useState, useRef, useCallback, useEffect, useMemo, startTransition } from 'react'
import { api } from '../lib/tauri'
import type { Message, TopicGroup } from '../hooks/useApp'
import { renderMarkdown, renderJsonSyntax } from '../lib/render'

interface Props { app: any }

// ── Shared image data URL cache ──
const imageDataCache = new Map<string, Promise<string>>()
function fetchImageDataUrlCached(url: string): Promise<string> {
  if (!imageDataCache.has(url)) {
    imageDataCache.set(url, api.fetchImageDataUrl(url))
  }
  return imageDataCache.get(url)!
}

// ── Avatar component (replaces 3 duplicate avatar renderings) ──
function Avatar({ icon, name, displayName, className, size }: {
  icon?: string | null; name?: string | null; displayName?: string | null
  className?: string; size?: number
}) {
  if (icon) {
    return <img src={icon} alt="" className={className} />
  }
  if (name || displayName) {
    const label = displayName || name || ''
    return <span className={className ? `${className} avatar-text` : 'avatar-text'}>{label.length <= 2 ? label : label.substring(0, 2)}</span>
  }
  const w = size || 16
  return (
    <svg className={className ? `${className} avatar-bell` : 'avatar-bell'} width={w} height={w} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  )
}

// ── TopicAvatar component (for topic cards, uses topic-specific CSS classes) ──
function TopicAvatar({ icon, name, displayName }: {
  icon?: string | null; name?: string | null; displayName?: string | null
}) {
  if (icon) {
    return <img src={icon} alt="" />
  }
  if (name || displayName) {
    const label = displayName || name || ''
    return <span className="topic-initials">{label.length <= 2 ? label : label.substring(0, 2)}</span>
  }
  return (
    <svg className="topic-bell-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  )
}

// ── Image URL detection ──
const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.ico']
function isImageUrl(url: string): boolean {
  const lower = url.split('?')[0].toLowerCase()
  return IMAGE_EXTS.some(ext => lower.endsWith(ext))
}

// ── Image Attachment with inline preview ──
function ImageAttachment({ att, T }: { att: { name: string; url: string }; T: any }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [lightbox, setLightbox] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true); setError(false); setDataUrl(null)
    fetchImageDataUrlCached(att.url).then(url => {
      if (!cancelled) { setDataUrl(url); setLoading(false) }
    }).catch(() => {
      if (!cancelled) { setError(true); setLoading(false) }
    })
    return () => { cancelled = true }
  }, [att.url])

  // Lightbox keyboard handler
  useEffect(() => {
    if (!lightbox) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightbox(false) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [lightbox])

  return (
    <>
      <div className="detail-att-card image-att">
        {loading && <div className="att-image-loading">⏳ Loading preview…</div>}
        {error && <div className="att-image-error">Failed to load image preview</div>}
        {dataUrl && (
          <>
            <img className="att-image-preview" src={dataUrl} alt={att.name || 'image'} onClick={() => setLightbox(true)} />
            <div className="att-image-footer">
              <span className="att-image-name">{att.name || 'image'}</span>
              <span style={{fontSize:'12px',color:'var(--accent)',cursor:'pointer'}} onClick={async e => { e.stopPropagation(); try { await api.downloadFile(att.url, att.name || 'image') } catch {} }}>{T.download} →</span>
            </div>
          </>
        )}
      </div>
      {lightbox && dataUrl && (
        <div className="image-lightbox" onClick={() => setLightbox(false)}>
          <button className="image-lightbox-download" title={T.download} onClick={async e => { e.stopPropagation(); try { await api.downloadFile(att.url, att.name || 'image') } catch {} }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          </button>
          <button className="image-lightbox-close" title={T.close} onClick={e => { e.stopPropagation(); setLightbox(false) }}>×</button>
          <img src={dataUrl} alt={att.name || 'image'} onClick={e => e.stopPropagation()} />
        </div>
      )}
    </>
  )
}

// ── MessageCard component ──
const MessageCard = React.memo(function MessageCard({ m, isSelectMode, isSelected, isNew, T, formatRelativeTime, parseTags, parseAttachment, showTopicIcon }: {
  m: Message; isSelectMode: boolean; isSelected: boolean; isNew: boolean
  T: any; formatRelativeTime: (d: string) => string
  parseTags: (m: Message) => string[]; parseAttachment: (m: Message) => any
  showTopicIcon?: boolean
}) {
  const tags = parseTags(m)
  const att = parseAttachment(m)
  const relTime = formatRelativeTime(m.received_at)
  const [thumbUrl, setThumbUrl] = useState<string | null>(null)

  useEffect(() => {
    if (att?.url && isImageUrl(att.url)) {
      let cancelled = false
      fetchImageDataUrlCached(att.url).then(url => { if (!cancelled) setThumbUrl(url) }).catch(() => {})
      return () => { cancelled = true }
    }
  }, [att?.url])

  return (
    <div className={`msg-card ${!m.read ? 'unread' : ''} ${isSelected ? 'selected' : ''} ${isNew ? 'msg-new' : ''}`} data-id={m.id}>
      {isSelectMode && <input type="checkbox" className="msg-checkbox" data-id={m.id} checked={isSelected} readOnly />}
      {showTopicIcon && m.topic_icon ? (
        <div className="msg-topic-icon">
          <Avatar icon={m.topic_icon} name={m.topic_name} displayName={m.topic_display_name} />
        </div>
      ) : (
        <div className={`msg-dot ${m.level || ''}`} />
      )}
      <div className="msg-content" data-id={m.id}>
        <div className="msg-title-row"><span className="msg-title-text">{m.title || T.untitled}</span></div>
        <div className="msg-body-preview">{(m.body || '').substring(0, 200)}</div>
      </div>
      {thumbUrl && (
        <img className="msg-thumb" src={thumbUrl} alt="" />
      )}
      {tags.length > 0 && (
        <div className="msg-tags-col">
          {tags.map(t => <span key={t} className="msg-tag">{t}</span>)}
        </div>
      )}
      <div className="msg-info-col">
        {att && <span className="msg-att-icon">📎</span>}
        {m.url && <span className="msg-att-icon">🔗</span>}
        <span className="msg-time">{relTime}</span>
        <div className="msg-actions">
          <span className={`msg-flag-icon ${m.flagged ? 'flagged' : ''}`} data-action="flag" data-id={m.id} title={m.flagged ? T.unflag : T.flag}>⚑</span>
          <button className="msg-del-btn" data-action="delete" data-id={m.id} title={T.delete}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
      </div>
    </div>
  )
}, (prev, next) => {
  return prev.m === next.m && prev.isSelectMode === next.isSelectMode
    && prev.isSelected === next.isSelected && prev.isNew === next.isNew
    && prev.T === next.T
})

// ── TopicCard component ──
function TopicCard({ group, T, formatRelativeTime, onDelete }: {
  group: TopicGroup; T: any; formatRelativeTime: (d: string) => string
  onDelete?: (group: TopicGroup) => void
}) {
  const latest = group.messages[0]
  const totalCount = (group as any).totalCount || group.messages.length
  const unreadCount = (group as any).unreadCount || 0
  const displayName = group.topicDisplayName || group.topicName || T.noTopic
  const relTime = latest ? formatRelativeTime(latest.received_at) : ''
  const topicDesc = group.topicDescription || ''
  const lastMsgPreview = latest ? (latest.body || latest.title || '').substring(0, 200) : ''

  return (
    <div className="topic-card" data-topic-key={group.key}>
      <div className="topic-avatar">
        <TopicAvatar icon={group.topicIcon} name={group.topicName} displayName={group.topicDisplayName} />
      </div>
      <div className="topic-body">
        <div className="topic-title-row">
          <span className="topic-name">{displayName}</span>
          <span className="topic-count-badge">{totalCount}</span>
          {unreadCount > 0 && <span className="topic-unread-badge">{unreadCount}</span>}
        </div>
        {topicDesc && <div className="topic-desc">{topicDesc}</div>}
        {lastMsgPreview && <div className="topic-preview">{lastMsgPreview}</div>}
      </div>
      <span className="topic-time">{relTime}</span>
      {onDelete && (
        <button className="topic-del-btn" title={T.clearMessages} onClick={(e) => { e.stopPropagation(); onDelete(group) }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
        </button>
      )}
    </div>
  )
}

// ── Empty state component ──
function EmptyState({ searchQuery, T }: { searchQuery: string; T: any }) {
  return (
    <div className="msg-empty">
      <div className="msg-empty-icon">
        {searchQuery
          ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /><line x1="8" y1="8" x2="14" y2="14" /><line x1="14" y1="8" x2="8" y2="14" /></svg>
          : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="M2 8h20" /><path d="M10 12h4" /></svg>
        }
      </div>
      {searchQuery ? T.noMessagesSearch : T.noMessages}
    </div>
  )
}

// ── Card image preview (lightweight, for MessageFullCard) ──
function CardImagePreview({ att, T }: { att: { name: string; url: string }; T: any }) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true); setError(false); setThumbUrl(null)
    fetchImageDataUrlCached(att.url).then(url => {
      if (!cancelled) { setThumbUrl(url); setLoading(false) }
    }).catch(() => {
      if (!cancelled) { setError(true); setLoading(false) }
    })
    return () => { cancelled = true }
  }, [att.url])

  if (error) return <div className="msg-full-card-attachment"><span className="att-name">{att.name || 'attachment'}</span></div>

  return (
    <div className="msg-full-card-image">
      {loading && <div className="att-image-loading">⏳</div>}
      {thumbUrl && (
        <img
          className="msg-full-card-image-img"
          src={thumbUrl}
          alt={att.name || 'image'}
          title={att.name || 'image'}
          onClick={async e => { e.stopPropagation(); try { await api.downloadFile(att.url, att.name || 'image') } catch {} }}
        />
      )}
    </div>
  )
}

// ── MessageFullCard component (card view with full content) ──
const MessageFullCard = React.memo(function MessageFullCard({ m, isSelectMode, isSelected, isNew, T, formatRelativeTime, parseTags, parseAttachment, renderMarkdown, renderJsonSyntax, onMarkRead }: {
  m: Message; isSelectMode: boolean; isSelected: boolean; isNew: boolean
  T: any; formatRelativeTime: (d: string) => string
  parseTags: (m: Message) => string[]; parseAttachment: (m: Message) => any
  renderMarkdown: (s: string) => string; renderJsonSyntax: (s: string) => string
  onMarkRead: (id: string) => void
}) {
  const tags = useMemo(() => parseTags(m), [m, parseTags])
  const att = useMemo(() => parseAttachment(m), [m, parseAttachment])
  const relTime = useMemo(() => formatRelativeTime(m.received_at), [m.received_at, formatRelativeTime])

  const { bodyHtml, bodyClass } = useMemo(() => {
    if (m.format === 'json') return { bodyHtml: renderJsonSyntax(m.body || ''), bodyClass: 'json' }
    if (m.format === 'markdown' || m.format === 'md') return { bodyHtml: renderMarkdown(m.body || ''), bodyClass: 'markdown' }
    if (m.format === 'html') return { bodyHtml: m.body || '', bodyClass: 'html-content' }
    return { bodyHtml: (m.body || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>'), bodyClass: '' }
  }, [m.body, m.format, renderMarkdown, renderJsonSyntax])

  return (
    <div className={`msg-full-card ${!m.read ? 'unread' : ''} ${isSelected ? 'selected' : ''} ${isNew ? 'msg-new' : ''}`} data-id={m.id} onClick={() => { if (!m.read) onMarkRead(m.id) }}>
      <div className="msg-full-card-header">
        {isSelectMode && <input type="checkbox" className="msg-checkbox" data-id={m.id} checked={isSelected} readOnly />}
        <div className={`msg-avatar ${m.level || ''}`}>
          <Avatar icon={m.topic_icon} name={m.topic_name} displayName={m.topic_display_name} />
        </div>
        <div className="msg-full-card-title-area">
          <span className="msg-full-card-title">{m.title || T.untitled}</span>
          <div className="msg-full-card-meta">
            <span className="msg-time">{relTime}</span>
            {att && <span className="msg-att-icon">📎</span>}
            {m.url && <span className="msg-att-icon">🔗</span>}
          </div>
        </div>
        <div className="msg-full-card-actions">
          <span className={`msg-flag-icon ${m.flagged ? 'flagged' : ''}`} data-action="flag" data-id={m.id} title={m.flagged ? T.unflag : T.flag}>⚑</span>
          <button className="msg-del-btn" data-action="delete" data-id={m.id} title={T.delete}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
      </div>
      {tags.length > 0 && (
        <div className="msg-full-card-tags">
          {tags.map(t => <span key={t} className="msg-tag">{t}</span>)}
        </div>
      )}
      {m.body && (
        <div className={`msg-full-card-body ${bodyClass}`} dangerouslySetInnerHTML={{ __html: bodyHtml }} />
      )}
      {att && att.url && (
        isImageUrl(att.url)
          ? <CardImagePreview att={att} T={T} />
          : <div className="msg-full-card-attachment">
              <span className="att-name">{att.name || 'attachment'}</span>
            </div>
      )}
    </div>
  )
}, (prev, next) => {
  return prev.m === next.m && prev.isSelectMode === next.isSelectMode
    && prev.isSelected === next.isSelected && prev.isNew === next.isNew
    && prev.T === next.T && prev.onMarkRead === next.onMarkRead
})

const CARD_EST_HEIGHT = 150  // initial estimate for card height before measurement

export function Dashboard({ app }: Props) {
  const { T, showToast, invoke, formatRelativeTime, parseTags, parseAttachment, getFilteredMessages, groupMessagesByTopic, MSG_HEIGHT, TOPIC_CARD_HEIGHT, newMsgIds } = app

  const [scrollTop, setScrollTop] = useState(0)
  const [cardScrollTop, setCardScrollTop] = useState(0)
  const scrollTopRef = useRef(0)
  const rafRef = useRef<number>(0)
  const [cardHeights, setCardHeights] = useState<Record<string, number>>({})
  const [cardsMeasured, setCardsMeasured] = useState(false)
  const [containerHeight, setContainerHeight] = useState(600)
  const [showScrollTop, setShowScrollTop] = useState(false)
  const [viewVisible, setViewVisible] = useState(true)
  const [deleteTopicTarget, setDeleteTopicTarget] = useState<TopicGroup | null>(null)
  const [deleteTopicAlsoServer, setDeleteTopicAlsoServer] = useState(false)
  const prevViewRef = useRef(app.viewMode)
  const listRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)

  // ── Derived data ──
  const filtered = useMemo(() => getFilteredMessages(), [app.allMessages, app.currentFilter, app.searchQuery, getFilteredMessages])

  const { topicGroups, displayMessages, detailTopicGroup } = useMemo(() => {
    if (app.viewMode === 'topics' && !app.topicDetailKey) {
      return { topicGroups: groupMessagesByTopic(filtered), displayMessages: [], detailTopicGroup: null }
    }
    if (app.topicDetailKey) {
      const groups = groupMessagesByTopic(filtered)
      return {
        topicGroups: [],
        displayMessages: groups.find((g: TopicGroup) => g.key === app.topicDetailKey)?.messages || [],
        detailTopicGroup: groups.find((g: TopicGroup) => g.key === app.topicDetailKey) || null
      }
    }
    return { topicGroups: [], displayMessages: filtered, detailTopicGroup: null }
  }, [app.viewMode, app.topicDetailKey, filtered, groupMessagesByTopic])

  const isEmpty = app.viewMode === 'topics' && !app.topicDetailKey
    ? topicGroups.length === 0
    : displayMessages.length === 0

  const viewportHeight = app.viewMode === 'topics' && !app.topicDetailKey
    ? topicGroups.length * TOPIC_CARD_HEIGHT
    : displayMessages.length * MSG_HEIGHT

  // ── Scroll handler for virtual scrolling (rAF-throttled) ──
  const handleScroll = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => {
      const el = listRef.current
      if (el) {
        scrollTopRef.current = el.scrollTop
        setScrollTop(el.scrollTop)
        setShowScrollTop(el.scrollTop > 300)
      }
    })
  }, [])

  useEffect(() => {
    const el = listRef.current
    if (!el) return
    el.addEventListener('scroll', handleScroll, { passive: true })
    return () => { el.removeEventListener('scroll', handleScroll); if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [handleScroll])

  // Compute visible range for virtual scrolling
  const itemHeight = (app.viewMode === 'topics' && !app.topicDetailKey) ? TOPIC_CARD_HEIGHT : MSG_HEIGHT
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - 5)
  const endIndex = Math.min(
    (app.viewMode === 'topics' && !app.topicDetailKey ? topicGroups.length : displayMessages.length),
    Math.ceil((scrollTop + containerHeight) / itemHeight) + 5
  )

  // ── Card view virtual scrolling (dynamic height) ──
  const isCardsView = app.viewMode === 'cards'

  // Update container height on resize
  useEffect(() => {
    if (!isCardsView) return
    const update = () => { if (listRef.current) setContainerHeight(listRef.current.clientHeight) }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [isCardsView])

  // Card scroll handler (rAF-throttled)
  const handleCardScroll = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => {
      const el = listRef.current
      if (el) {
        scrollTopRef.current = el.scrollTop
        setCardScrollTop(el.scrollTop)
        setShowScrollTop(el.scrollTop > 300)
      }
    })
  }, [])

  useEffect(() => {
    if (!isCardsView || !listRef.current) return
    const el = listRef.current
    el.addEventListener('scroll', handleCardScroll, { passive: true })
    return () => { el.removeEventListener('scroll', handleCardScroll); if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [isCardsView, handleCardScroll])

  // Measure card heights (Phase 1 — initial measurement)
  const measureCard = useCallback((id: string, el: HTMLDivElement | null) => {
    if (!el) return
    const h = el.getBoundingClientRect().height
    setCardHeights(prev => {
      if (prev[id] === h) return prev
      return { ...prev, [id]: h }
    })
  }, [])

  // Mark measurement complete after render
  useEffect(() => {
    if (isCardsView && displayMessages.length > 0) {
      requestAnimationFrame(() => setCardsMeasured(true))
    }
  }, [isCardsView, displayMessages.length])

  // Reset measurement when switching views
  useEffect(() => {
    if (!isCardsView) {
      setCardsMeasured(false)
      setCardHeights({})
    }
  }, [isCardsView])

  // Card virtual scroll: compute visible range with dynamic heights
  const cardTotalHeight = useMemo(() => {
    if (!isCardsView) return 0
    return displayMessages.reduce((sum: number, m: Message) => sum + (cardHeights[m.id] || CARD_EST_HEIGHT), 0)
  }, [isCardsView, displayMessages, cardHeights])

  const cardVirtualRange = useMemo(() => {
    if (!isCardsView) return { startIndex: 0, endIndex: 0, offsetY: 0 }
    const BUFFER = 5
    if (!cardsMeasured) {
      return { startIndex: 0, endIndex: displayMessages.length, offsetY: 0 }
    }
    let cumH = 0
    let start = 0
    for (let i = 0; i < displayMessages.length; i++) {
      const h = cardHeights[displayMessages[i].id] || CARD_EST_HEIGHT
      if (cumH + h > cardScrollTop - containerHeight * 0.5) { start = i; break }
      cumH += h
      if (i === displayMessages.length - 1) start = i
    }
    const visStart = Math.max(0, start - BUFFER)
    let visEnd = visStart
    let y = 0
    for (let i = 0; i < visStart; i++) y += cardHeights[displayMessages[i].id] || CARD_EST_HEIGHT
    for (let i = visStart; i < displayMessages.length; i++) {
      y += cardHeights[displayMessages[i].id] || CARD_EST_HEIGHT
      visEnd = i + 1
      if (y > cardScrollTop + containerHeight + containerHeight * 0.5) break
    }
    return { startIndex: visStart, endIndex: Math.min(visEnd, displayMessages.length), offsetY: 0 }
  }, [isCardsView, cardsMeasured, displayMessages, cardScrollTop, containerHeight, cardHeights])

  const cardOffsets = useMemo(() => {
    if (!isCardsView || !cardsMeasured) return []
    const offsets: number[] = []
    let sum = 0
    for (const m of displayMessages) {
      offsets.push(sum)
      sum += cardHeights[m.id] || CARD_EST_HEIGHT
    }
    return offsets
  }, [isCardsView, cardsMeasured, displayMessages, cardHeights])

  // ── View transition: fade out → switch → fade in ──
  useEffect(() => {
    if (prevViewRef.current !== app.viewMode) {
      prevViewRef.current = app.viewMode
      setViewVisible(false)
      const t = setTimeout(() => startTransition(() => setViewVisible(true)), 150)
      return () => clearTimeout(t)
    }
  }, [app.viewMode])

  // Phase 2: ResizeObserver to re-measure cards when images load asynchronously
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  useEffect(() => {
    if (!cardsMeasured || !isCardsView) return
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        const id = (entry.target as HTMLElement).dataset.cardId
        if (!id) continue
        const h = entry.borderBoxSize?.[0]?.blockSize ?? entry.target.getBoundingClientRect().height
        setCardHeights(prev => {
          if (prev[id] === h) return prev
          return { ...prev, [id]: h }
        })
      }
    })
    // Observe all currently rendered card wrappers
    cardRefs.current.forEach(el => { if (el) observer.observe(el) })
    return () => observer.disconnect()
  }, [cardsMeasured, isCardsView, cardVirtualRange.startIndex, cardVirtualRange.endIndex])

  // ── Click handler with event delegation ──
  const handleViewportClick = useCallback(async (e: React.MouseEvent) => {
    const target = e.target as HTMLElement

    // Topic card click
    if (app.viewMode === 'topics' && !app.topicDetailKey) {
      const card = target.closest('.topic-card') as HTMLElement | null
      if (card) {
        const key = card.dataset.topicKey
        if (key) {
          app.setTopicDetailKey(key)
        }
      }
      return
    }

    // Message card actions
    const flagEl = target.closest('[data-action="flag"]') as HTMLElement | null
    if (flagEl) {
      e.stopPropagation()
      flagEl.classList.add('pop')
      await invoke('toggle_flag', { id: flagEl.dataset.id })
      app.refreshMessages()
      setTimeout(() => flagEl.classList.remove('pop'), 350)
      return
    }
    const delEl = target.closest('[data-action="delete"]') as HTMLElement | null
    if (delEl) {
      e.stopPropagation()
      app.deleteWithUndo(delEl.dataset.id)
      return
    }

    // Select mode checkbox
    if (app.selectMode) {
      const checkbox = target.closest('.msg-checkbox') as HTMLInputElement | null
      if (checkbox) {
        const id = checkbox.dataset.id!
        const next = new Set(app.selectedIds)
        if (next.has(id)) next.delete(id); else next.add(id)
        app.setSelectedIds(next)
        return
      }
    }

    // Open detail
    const card = target.closest('.msg-card') as HTMLElement | null
    if (card) {
      const id = card.dataset.id
      const msg = app.allMessages.find((m: Message) => m.id === id)
      if (msg) { if (!msg.read) app.markAsRead(msg.id); app.setDetailMsg(msg) }
    }
  }, [app, invoke])

  // ── Undo snackbar — use the stable undoDelete from useApp ──
  const handleUndo = useCallback(async () => {
    await app.undoDelete()
  }, [app.undoDelete])

  // ── Close topic detail ──
  const closeTopicDetail = useCallback(() => {
    app.setTopicDetailKey(null)
  }, [app])

  // ── Toggle view mode (using app.toggleViewMode) ──
  const toggleViewMode = useCallback(() => {
    app.toggleViewMode()
    app.setTopicDetailKey(null)
  }, [app.toggleViewMode, app.setTopicDetailKey])

  // ── Filtered count for badge ──
  const unreadCount = app.allMessages.filter((m: Message) => !m.read).length

  // ── Detail body memo (for renderDetail) ──
  const detailBody = useMemo(() => {
    if (!app.detailMsg) return { bodyHtml: '', bodyClass: '' }
    const m = app.detailMsg
    if (m.format === 'json') return { bodyHtml: renderJsonSyntax(m.body), bodyClass: 'json' }
    if (m.format === 'markdown' || m.format === 'md') return { bodyHtml: renderMarkdown(m.body), bodyClass: 'markdown' }
    if (m.format === 'html') return { bodyHtml: m.body || '', bodyClass: 'html-content' }
    return { bodyHtml: (m.body || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>'), bodyClass: '' }
  }, [app.detailMsg, renderMarkdown, renderJsonSyntax])

  // ── Detail view ──
  const renderDetail = useCallback(() => {
    if (!app.detailMsg) return null
    const m = app.detailMsg
    const tags = parseTags(m)
    const att = parseAttachment(m)
    const { bodyHtml, bodyClass } = detailBody

    return (
      <div className="detail-overlay open" id="detailOverlay">
        <div className="detail-header">
          <button className="icon-btn" id="detailBackBtn" title="Back" onClick={() => app.setDetailMsg(null)}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6" /></svg>
          </button>
          <h2 id="t-detail-title">{T.msgDetail}</h2>
          <div className="detail-header-actions">
            <button className={`detail-flag-btn ${m.flagged ? 'flagged' : ''}`} id="detailFlagBtn" title={m.flagged ? T.unflag : T.flag} onClick={async () => {
              await app.toggleFlag(m.id)
              const updated = { ...m, flagged: !m.flagged }
              app.setDetailMsg(updated)
              const btn = document.getElementById('detailFlagBtn')
              if (btn) { btn.classList.remove('pop'); void (btn as HTMLElement).offsetWidth; btn.classList.add('pop') }
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" /></svg>
            </button>
            <button className="detail-del-btn" id="detailDelBtn" title={T.delete} onClick={async () => {
              const btn = document.getElementById('detailDelBtn')
              if (btn) { btn.classList.remove('shake'); void (btn as HTMLElement).offsetWidth; btn.classList.add('shake'); await new Promise(r => btn.addEventListener('animationend', r, { once: true })) }
              app.deleteWithUndo(m.id); app.setDetailMsg(null)
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
            </button>
          </div>
        </div>
        <div className="detail-body" id="detailContent">
          <div className="detail-title-row">
            <div className={`detail-avatar ${m.level || ''}`}>
              <Avatar icon={m.topic_icon} name={m.topic_name} displayName={m.topic_display_name} />
            </div>
            <span className="detail-title">{m.title || T.untitled}</span>
            <button className="copy-btn" title={T.copyTitle} onClick={() => { navigator.clipboard.writeText(m.title || ''); showToast(T.copied, 'success'); const btn = document.querySelector('.detail-title-row .copy-btn'); if (btn) { btn.classList.add('copied'); setTimeout(() => btn.classList.remove('copied'), 1500) } }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
            </button>
          </div>
          <div className="detail-meta"><span className="detail-time">{formatRelativeTime(m.received_at)}</span></div>
          {m.url && <a className="detail-url-btn" href="#" onClick={async e => { e.preventDefault(); try { await invoke('download_file', { url: m.url, filename: m.title || 'file' }) } catch {} }} >🔗 {m.url}</a>}
          {m.body && (
          <div className="detail-content-card">
            <div className="detail-content-header">
              <span className="detail-format-label">{m.format === 'json' ? '{ } JSON' : m.format === 'markdown' || m.format === 'md' ? 'M↓ Markdown' : m.format === 'html' ? '</> HTML' : 'Content'}</span>
              <button className="copy-btn" title={T.copy} onClick={() => { navigator.clipboard.writeText(m.body || ''); showToast(T.copied, 'success'); const btn = document.querySelector('.detail-content-header .copy-btn'); if (btn) { btn.classList.add('copied'); setTimeout(() => btn.classList.remove('copied'), 1500) } }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
              </button>
            </div>
            <div className={`detail-content-body ${bodyClass}`} dangerouslySetInnerHTML={{ __html: bodyHtml }} />
          </div>
          )}
          {tags.length > 0 && <><div className="detail-section-title">{T.tags}</div><div className="detail-tags">{tags.map((t: string) => <span key={t} className="detail-tag">{t}</span>)}</div></>}
          {att && <><div className="detail-section-title">{T.attachment}</div>
            {att.url && isImageUrl(att.url)
              ? <ImageAttachment att={att} T={T} />
              : <div className="detail-att-card" onClick={async () => { try { await invoke('download_file', { url: att.url, filename: att.name || 'file' }) } catch {} }}>
                  <span style={{fontSize:'20px'}}>📎</span>
                  <div className="detail-att-info"><div className="detail-att-name">{att.name || 'file'}</div></div>
                  <span style={{fontSize:'12px',color:'var(--accent)'}}>{T.download} →</span>
                </div>
            }
          </>}
        </div>
      </div>
    )
  }, [app.detailMsg, T, showToast, invoke, formatRelativeTime, parseTags, parseAttachment, detailBody])

  return (
    <div className="view active" id="viewDashboard">
      {/* Search bar - conditionally shown */}
      {app.showSearch && (
        <div className="search-box" id="toolbarArea" style={{marginBottom:'8px'}}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          <input type="text" id="searchInput" placeholder={T.search} value={app.searchQuery} onChange={e => app.setSearchQuery(e.target.value)} autoFocus />
        </div>
      )}

      <div className="card">
        {app.selectMode && (
          <div className="select-bar visible" id="selectBar">
            <div className="select-bar-left"><span id="selectCount">{app.selectedIds.size}</span> {T.selected}</div>
            <div className="select-bar-actions">
              <button className="icon-btn" id="selectAllBtn" title="Select All" onClick={() => { const f = getFilteredMessages(); if (app.selectedIds.size === f.length) app.setSelectedIds(new Set()); else app.setSelectedIds(new Set(f.map((m: Message) => m.id))) }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6 9 17l-5-5" /></svg>
              </button>
              <button className="icon-btn danger" id="deleteSelectedBtn" title="Delete" onClick={() => app.showDeleteConfirm(T.deleteConfirmTitle, () => app.deleteSelected())}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
              </button>
              <button className="icon-btn" id="cancelSelectBtn" title="Cancel" onClick={() => { app.setSelectMode(false); app.setSelectedIds(new Set()) }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
          </div>
        )}

        <div className="card-body-scroll" style={{ opacity: viewVisible ? 1 : 0, transition: 'opacity 0.15s ease' }}>
          {/* Topic detail bar — driven by topicDetailKey state instead of DOM manipulation */}
          {app.topicDetailKey && detailTopicGroup && (
            <div id="topicDetailBar" style={{display:'flex',flexDirection:'column',padding:'8px 14px',borderBottom:'1px solid var(--border)',flexShrink:0}}>
              <div style={{display:'flex',alignItems:'center',gap:'10px'}}>
                <button className="icon-btn" id="topicDetailBackBtn" title="Back" style={{flexShrink:0}} onClick={closeTopicDetail}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6" /></svg>
                </button>
                <div className="topic-detail-avatar">
                  <TopicAvatar icon={detailTopicGroup.topicIcon} name={detailTopicGroup.topicName} displayName={detailTopicGroup.topicDisplayName} />
                </div>
                <div style={{flex:1,overflow:'hidden'}}>
                  <div style={{fontSize:'14px',fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                    {detailTopicGroup.topicDisplayName || detailTopicGroup.topicName || T.noTopic}
                  </div>
                  {detailTopicGroup.topicDescription && (
                    <div style={{fontSize:'12px',color:'var(--text-secondary)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',marginTop:'2px'}}>
                      {detailTopicGroup.topicDescription}
                    </div>
                  )}
                </div>
                {detailTopicGroup.topicId && (
                  <button className="icon-btn danger" title={T.clearMessages} style={{flexShrink:0}} onClick={() => {
                    setDeleteTopicTarget(detailTopicGroup)
                  }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="msg-scroll" id="msgListBody" ref={listRef} onClick={handleViewportClick}>
            {app.viewMode === 'cards' ? (
              // Card view - virtual scroll with dynamic heights
              isEmpty ? (
                <EmptyState searchQuery={app.searchQuery} T={T} />
              ) : <>
                {/* Phase 1: skeleton measuring (all cards rendered hidden, skeletons visible) */}
                {!cardsMeasured && (
                  <div className="cards-measuring" style={{ position: 'relative' }}>
                    {/* Visible skeleton placeholders */}
                    {Array.from({ length: Math.min(displayMessages.length, 15) }, (_, i) => (
                      <div key={`skel-${i}`} className="skeleton-card">
                        <div className="skeleton-header">
                          <div className="skeleton-avatar" />
                          <div className="skeleton-title-area">
                            <div className="skeleton-title" />
                            <div className="skeleton-meta" />
                          </div>
                        </div>
                        <div className="skeleton-body" />
                        <div className="skeleton-body-short" />
                      </div>
                    ))}
                    {/* Hidden cards for height measurement */}
                    {displayMessages.map((m: Message) => (
                      <div key={m.id} ref={el => measureCard(m.id, el)} style={{ visibility: 'hidden', position: 'relative', pointerEvents: 'none' }}>
                        <MessageFullCard
                          m={m}
                          isSelectMode={false}
                          isSelected={false}
                          isNew={false}
                          T={T}
                          formatRelativeTime={formatRelativeTime}
                          parseTags={parseTags}
                          parseAttachment={parseAttachment}
                          renderMarkdown={renderMarkdown}
                          renderJsonSyntax={renderJsonSyntax}
                          onMarkRead={app.markAsRead}
                        />
                      </div>
                    ))}
                  </div>
                )}
                {/* Phase 2: visible cards only */}
                {cardsMeasured && (
                  <div className="cards-container" style={{ position: 'relative', height: cardTotalHeight }}>
                    {displayMessages.slice(cardVirtualRange.startIndex, cardVirtualRange.endIndex).map((m: Message, i: number) => {
                      const top = cardOffsets[cardVirtualRange.startIndex + i] || 0
                      return (
                        <div
                          key={m.id}
                          data-card-id={m.id}
                          ref={el => {
                            if (el) cardRefs.current.set(m.id, el); else cardRefs.current.delete(m.id)
                          }}
                          style={{ position: 'absolute', top, left: 0, right: 0 }}
                        >
                          <MessageFullCard
                            m={m}
                            isSelectMode={app.selectMode}
                            isSelected={app.selectedIds.has(m.id)}
                            isNew={newMsgIds.has(m.id)}
                            T={T}
                            formatRelativeTime={formatRelativeTime}
                            parseTags={parseTags}
                            parseAttachment={parseAttachment}
                            renderMarkdown={renderMarkdown}
                            renderJsonSyntax={renderJsonSyntax}
                            onMarkRead={app.markAsRead}
                          />
                        </div>
                      )
                    })}
                  </div>
                )}
              </>
            ) : (
              <div className="msg-viewport" id="msgViewport" ref={viewportRef} style={{ height: isEmpty ? 'auto' : viewportHeight }}>
                {isEmpty ? (
                  <EmptyState searchQuery={app.searchQuery} T={T} />
                ) : app.viewMode === 'topics' && !app.topicDetailKey ? (
                  // Topic list view with virtual scrolling
                  topicGroups.slice(startIndex, endIndex).map((group: TopicGroup, i: number) => (
                    <div key={group.key} style={{ position: 'absolute', top: (startIndex + i) * TOPIC_CARD_HEIGHT, left: 0, right: 0, height: TOPIC_CARD_HEIGHT }}>
                      <TopicCard group={group} T={T} formatRelativeTime={formatRelativeTime} onDelete={setDeleteTopicTarget} />
                    </div>
                  ))
                ) : (
                  // Message list view (or topic detail) with virtual scrolling
                  displayMessages.slice(startIndex, endIndex).map((m: Message, i: number) => (
                    <div key={m.id} style={{ position: 'absolute', top: (startIndex + i) * MSG_HEIGHT, left: 0, right: 0, height: MSG_HEIGHT }}>
                      <MessageCard
                        m={m}
                        isSelectMode={app.selectMode}
                        isSelected={app.selectedIds.has(m.id)}
                        isNew={newMsgIds.has(m.id)}
                        T={T}
                        formatRelativeTime={formatRelativeTime}
                        parseTags={parseTags}
                        parseAttachment={parseAttachment}
                        showTopicIcon={!app.topicDetailKey}
                      />
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {app.lastDeleted && (
        <div className="snackbar visible" id="undoSnackbar">
          <span id="snackbarText">{T.msgDeleted}</span>
          <button className="snackbar-undo" id="undoBtn" onClick={handleUndo}>{T.undo}</button>
        </div>
      )}

      <button className={`scroll-top-btn ${showScrollTop ? 'visible' : ''}`} title={T.scrollTop} onClick={() => { listRef.current?.scrollTo({ top: 0, behavior: 'smooth' }) }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m18 15-6-6-6 6"/></svg>
      </button>

      {renderDetail()}

      {/* Error Detail Modal */}
      {app.errorDetailOpen && (
        <div className="modal-overlay open" onClick={() => app.setErrorDetailOpen(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{maxWidth:'480px'}}>
            <div className="modal-header">
              <h3 className="modal-title">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--error)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight:'8px',verticalAlign:'middle'}}>
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                {T.connectionError || 'Connection Error'}
              </h3>
              <button className="modal-close" onClick={() => app.setErrorDetailOpen(false)}>×</button>
            </div>
            <div className="modal-body" style={{padding:'16px 20px'}}>
              <div style={{
                background:'var(--bg2)',
                border:'1px solid var(--border)',
                borderRadius:'8px',
                padding:'12px 14px',
                fontSize:'12px',
                fontFamily:'monospace',
                color:'var(--text2)',
                wordBreak:'break-all',
                lineHeight:'1.6',
                maxHeight:'200px',
                overflowY:'auto'
              }}>
                {app.connStatus.text}
              </div>
              <div style={{marginTop:'12px',fontSize:'12px',color:'var(--text3)'}}>
                {T.connectionErrorHint || 'Check your network connection and server settings.'}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => app.setErrorDetailOpen(false)}>{T.close}</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Topic Dialog */}
      {deleteTopicTarget && (
        <div className="modal-overlay open" onClick={() => { setDeleteTopicTarget(null); setDeleteTopicAlsoServer(false) }}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{maxWidth:'400px'}}>
            <div className="modal-header">
              <h3 className="modal-title">{T.deleteTopic}</h3>
              <button className="modal-close" onClick={() => { setDeleteTopicTarget(null); setDeleteTopicAlsoServer(false) }}>×</button>
            </div>
            <div className="modal-body" style={{padding:'16px 20px'}}>
              <p style={{margin:'0 0 12px',fontSize:'13px',color:'var(--text-secondary)'}}>
                {T.deleteTopicDialogDesc} <strong>{deleteTopicTarget.topicDisplayName || deleteTopicTarget.topicName}</strong>?
              </p>
              <label style={{display:'flex',alignItems:'center',gap:'8px',fontSize:'13px',cursor:'pointer'}}>
                <input
                  type="checkbox"
                  checked={deleteTopicAlsoServer}
                  onChange={e => setDeleteTopicAlsoServer(e.target.checked)}
                />
                {T.deleteTopicAlsoServer}
              </label>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => { setDeleteTopicTarget(null); setDeleteTopicAlsoServer(false) }}>{T.cancel}</button>
              <button className="btn btn-danger" onClick={async () => {
                const topicId = deleteTopicTarget.topicId
                if (!topicId) return
                if (deleteTopicAlsoServer) {
                  await app.deleteTopic(topicId)
                } else {
                  await app.clearTopicMessages(topicId)
                }
                setDeleteTopicTarget(null)
                setDeleteTopicAlsoServer(false)
              }}>{T.confirm}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
