import { useState, useRef, useCallback, useEffect } from 'react'
import type { Message, TopicGroup } from '../hooks/useApp'
import { renderMarkdown, renderJsonSyntax } from '../lib/render'

interface Props { app: any }

export function Dashboard({ app }: Props) {
  const { T, showToast, invoke, escHtml, formatRelativeTime, parseTags, parseAttachment, getFilteredMessages, groupMessagesByTopic, MSG_HEIGHT, TOPIC_CARD_HEIGHT, newMsgIds } = app

  const [scrollTop, setScrollTop] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)

  // ── Build message card HTML ──
  const buildMessageCard = useCallback((m: Message, isSelectMode: boolean, isSelected: boolean) => {
    const tags = parseTags(m)
    const att = parseAttachment(m)
    const relTime = formatRelativeTime(m.received_at)

    let avatar = ''
    if (m.topic_icon) avatar = `<img src="${escHtml(m.topic_icon)}" alt="">`
    else if (m.topic_name || m.topic_display_name) {
      const label = m.topic_display_name || m.topic_name || ''
      avatar = `<span class="avatar-text">${escHtml(label.length <= 2 ? label : label.substring(0, 2))}</span>`
    } else {
      avatar = `<svg class="avatar-bell" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>`
    }

    let tagsHtml = ''
    if (tags.length || (m.format && m.format !== 'text')) {
      tagsHtml = '<div class="msg-tags-col">'
      for (const t of tags) tagsHtml += `<span class="msg-tag">${escHtml(t)}</span>`
      if (m.format && m.format !== 'text') tagsHtml += `<span class="msg-tag">${escHtml(m.format)}</span>`
      tagsHtml += '</div>'
    }

    let infoHtml = '<div class="msg-info-col">'
    if (att) infoHtml += '<span class="msg-att-icon">📎</span>'
    if (m.url) infoHtml += '<span class="msg-att-icon">🔗</span>'
    infoHtml += `<span class="msg-time">${escHtml(relTime)}</span></div>`

    const checkbox = isSelectMode ? `<input type="checkbox" class="msg-checkbox" data-id="${m.id}" ${isSelected ? 'checked' : ''}>` : ''

    return `<div class="msg-card ${!m.read ? 'unread' : ''} ${isSelected ? 'selected' : ''} ${app.newMsgIds.has(m.id) ? 'msg-new' : ''}" data-id="${m.id}">
      ${checkbox}
      <div class="msg-avatar ${m.level || ''}">${avatar}</div>
      <div class="msg-content" data-id="${m.id}">
        <div class="msg-title-row"><span class="msg-title-text">${escHtml(m.title || T.untitled)}</span></div>
        <div class="msg-body-preview">${escHtml((m.body || '').substring(0, 120))}</div>
      </div>
      ${tagsHtml}
      ${infoHtml}
      <div class="msg-right">
        <div class="msg-flags">
          <span class="msg-flag-icon ${m.flagged ? 'flagged' : ''}" data-action="flag" data-id="${m.id}" title="${m.flagged ? T.unflag : T.flag}">⚑</span>
          <button class="msg-del-btn" data-action="delete" data-id="${m.id}" title="${T.delete}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
        </div>
      </div>
    </div>`
  }, [T, escHtml, formatRelativeTime, parseTags, parseAttachment, app.newMsgIds])

  // ── Build topic card HTML ──
  const buildTopicCard = useCallback((group: TopicGroup) => {
    const latest = group.messages[0]
    const totalCount = group.messages.length
    const unreadCount = group.messages.filter(m => !m.read).length
    const displayName = group.topicDisplayName || group.topicName || T.noTopic
    const relTime = latest ? formatRelativeTime(latest.received_at) : ''
    const preview = latest ? (latest.title || latest.body || '').substring(0, 80) : ''

    let avatarHtml = ''
    if (group.topicIcon) avatarHtml = `<img src="${escHtml(group.topicIcon)}" alt="">`
    else if (group.topicName || group.topicDisplayName) {
      const label = group.topicDisplayName || group.topicName || ''
      avatarHtml = `<span class="topic-initials">${escHtml(label.length <= 2 ? label : label.substring(0, 2))}</span>`
    } else {
      avatarHtml = `<svg class="topic-bell-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>`
    }

    return `<div class="topic-card" data-topic-key="${escHtml(group.key)}">
      <div class="topic-avatar">${avatarHtml}</div>
      <div class="topic-body">
        <div class="topic-title-row">
          <span class="topic-name">${escHtml(displayName)}</span>
          <span class="topic-count-badge">${totalCount}</span>
          ${unreadCount > 0 ? `<span class="topic-unread-badge">${unreadCount}</span>` : ''}
        </div>
        <div class="topic-preview">${escHtml(preview)}</div>
      </div>
      <span class="topic-time">${escHtml(relTime)}</span>
    </div>`
  }, [T, escHtml, formatRelativeTime])

  // ── Render into viewport ──
  const renderViewport = useCallback(() => {
    const viewport = viewportRef.current
    if (!viewport) return

    const filtered = getFilteredMessages()

    if (app.viewMode === 'topics' && !app.topicDetailKey) {
      // Topic list view
      const groups = groupMessagesByTopic(filtered)
      if (groups.length === 0) {
        viewport.innerHTML = `<div class="msg-empty"><div class="msg-empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 8h20"/><path d="M10 12h4"/></svg></div>${app.searchQuery ? T.noMessagesSearch : T.noMessages}</div>`
        viewport.style.height = 'auto'
        return
      }
      viewport.style.height = (groups.length * TOPIC_CARD_HEIGHT) + 'px'
      let html = ''
      for (let i = 0; i < groups.length; i++) {
        html += `<div style="position:absolute;top:${i * TOPIC_CARD_HEIGHT}px;left:0;right:0;height:${TOPIC_CARD_HEIGHT}px">${buildTopicCard(groups[i])}</div>`
      }
      viewport.innerHTML = html
    } else {
      // Message list view (or topic detail)
      let messages = filtered
      if (app.topicDetailKey) {
        const groups = groupMessagesByTopic(filtered)
        const group = groups.find((g: TopicGroup) => g.key === app.topicDetailKey)
        messages = group ? group.messages : []
      }

      if (messages.length === 0) {
        const emptyIcon = app.searchQuery
          ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="8" x2="14" y2="14"/><line x1="14" y1="8" x2="8" y2="14"/></svg>'
          : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 8h20"/><path d="M10 12h4"/></svg>'
        const emptyMsg = app.searchQuery ? T.noMessagesSearch : T.noMessages
        viewport.innerHTML = `<div class="msg-empty"><div class="msg-empty-icon">${emptyIcon}</div>${emptyMsg}</div>`
        viewport.style.height = 'auto'
        return
      }

      viewport.style.height = (messages.length * MSG_HEIGHT) + 'px'
      let html = ''
      for (let i = 0; i < messages.length; i++) {
        const isSelected = app.selectedIds.has(messages[i].id)
        html += `<div style="position:absolute;top:${i * MSG_HEIGHT}px;left:0;right:0;height:${MSG_HEIGHT}px">${buildMessageCard(messages[i], app.selectMode, isSelected)}</div>`
      }
      viewport.innerHTML = html
    }
  }, [app.viewMode, app.topicDetailKey, app.selectMode, app.selectedIds, app.searchQuery, app.allMessages, app.currentFilter, getFilteredMessages, groupMessagesByTopic, buildMessageCard, buildTopicCard, T, MSG_HEIGHT, TOPIC_CARD_HEIGHT])

  // Re-render on state changes
  useEffect(() => { renderViewport() }, [renderViewport])

  // Pop unread badge when new messages arrive
  useEffect(() => {
    if (newMsgIds.size > 0) {
      const badge = document.getElementById('headerUnreadBadge')
      if (badge) { badge.classList.remove('pop'); void (badge as HTMLElement).offsetWidth; badge.classList.add('pop') }
    }
  }, [newMsgIds])

  // ── Click handlers on viewport ──
  const handleViewportClick = useCallback(async (e: React.MouseEvent) => {
    const target = e.target as HTMLElement

    // Topic card click
    if (app.viewMode === 'topics' && !app.topicDetailKey) {
      const card = target.closest('.topic-card') as HTMLElement | null
      if (card) {
        const key = card.dataset.topicKey
        if (key) {
          app.setTopicDetailKey(key)
          // Show topic detail bar
          const toolbar = document.getElementById('toolbarArea')
          const bar = document.getElementById('topicDetailBar')
          if (toolbar) toolbar.style.display = 'none'
          if (bar) {
            bar.style.display = 'flex'
            const groups = groupMessagesByTopic(getFilteredMessages())
            const group = groups.find((g: TopicGroup) => g.key === key)
            if (group) {
              const title = document.getElementById('topicDetailTitle')
              if (title) title.textContent = group.topicDisplayName || group.topicName || T.noTopic
              const avatar = document.getElementById('topicDetailAvatar')
              if (avatar) {
                if (group.topicIcon) avatar.innerHTML = `<img src="${escHtml(group.topicIcon)}" alt="">`
                else if (group.topicName || group.topicDisplayName) {
                  const label = group.topicDisplayName || group.topicName || ''
                  avatar.innerHTML = `<span class="topic-initials">${escHtml(label.length <= 2 ? label : label.substring(0, 2))}</span>`
                } else {
                  avatar.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>`
                }
              }
            }
          }
        }
      }
      return
    }

    // Message card actions
    const flagEl = target.closest('[data-action="flag"]') as HTMLElement | null
    if (flagEl) {
      e.stopPropagation()
      await invoke('toggle_flag', { id: flagEl.dataset.id })
      app.refreshMessages()
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
  }, [app, invoke, T, escHtml, getFilteredMessages, groupMessagesByTopic])

  // ── Undo snackbar ──
  const handleUndo = useCallback(async () => {
    if (!app.lastDeleted) return
    await invoke('insert_message', { msg: app.lastDeleted.msg })
    app.refreshMessages()
  }, [app.lastDeleted, invoke, app.refreshMessages])

  // ── Detail view ──
  const renderDetail = useCallback(() => {
    if (!app.detailMsg) return null
    const m = app.detailMsg
    const tags = parseTags(m)
    const att = parseAttachment(m)

    let bodyHtml = ''
    let bodyClass = ''
    if (m.format === 'json') {
      bodyHtml = renderJsonSyntax(m.body)
      bodyClass = 'json'
    } else if (m.format === 'markdown' || m.format === 'md') {
      bodyHtml = renderMarkdown(m.body)
      bodyClass = 'markdown'
    } else if (m.format === 'html') {
      bodyHtml = m.body  // HTML content rendered as-is
      bodyClass = 'html-content'
    } else {
      bodyHtml = escHtml(m.body).replace(/\n/g, '<br>')
    }

    let avatarHtml = ''
    if (m.topic_icon) avatarHtml = `<img src="${escHtml(m.topic_icon)}" alt="">`
    else if (m.topic_name || m.topic_display_name) {
      const label = m.topic_display_name || m.topic_name || ''
      avatarHtml = `<span class="avatar-text">${escHtml(label.length <= 2 ? label : label.substring(0, 2))}</span>`
    } else {
      avatarHtml = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>`
    }

    return (
      <div className="detail-overlay open" id="detailOverlay">
        <div className="detail-header">
          <button className="icon-btn" id="detailBackBtn" title="Back" onClick={() => app.setDetailMsg(null)}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>
          </button>
          <h2 id="t-detail-title">{T.msgDetail}</h2>
          <div className="detail-header-actions">
            <button className={`detail-flag-btn ${m.flagged ? 'flagged' : ''}`} id="detailFlagBtn" title={m.flagged ? T.unflag : T.flag} onClick={async () => {
              await app.toggleFlag(m.id)
              const updated = { ...m, flagged: !m.flagged }
              app.setDetailMsg(updated)
              // Pop animation
              const btn = document.getElementById('detailFlagBtn')
              if (btn) { btn.classList.remove('pop'); void (btn as HTMLElement).offsetWidth; btn.classList.add('pop') }
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
            </button>
            <button className="detail-del-btn" id="detailDelBtn" title={T.delete} onClick={async () => {
              const btn = document.getElementById('detailDelBtn')
              if (btn) { btn.classList.remove('shake'); void (btn as HTMLElement).offsetWidth; btn.classList.add('shake'); await new Promise(r => btn.addEventListener('animationend', r, { once: true })) }
              app.deleteWithUndo(m.id); app.setDetailMsg(null)
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        </div>
        <div className="detail-body" id="detailContent">
          <div className="detail-title-row">
            <div className={`detail-avatar ${m.level || ''}`} dangerouslySetInnerHTML={{ __html: avatarHtml }} />
            <span className="detail-title">{m.title || T.untitled}</span>
            <button className="copy-btn" title={T.copyTitle} onClick={() => { navigator.clipboard.writeText(m.title || ''); showToast(T.copied, 'success'); const btn = document.querySelector('.detail-title-row .copy-btn'); if (btn) { btn.classList.add('copied'); setTimeout(() => btn.classList.remove('copied'), 1500) } }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            </button>
          </div>
          <div className="detail-meta"><span className="detail-time">{formatRelativeTime(m.received_at)}</span></div>
          {m.url && <a className="detail-url-btn" href="#" onClick={async e => { e.preventDefault(); try { await invoke('download_file', { url: m.url, filename: m.title || 'file' }) } catch {}}} >🔗 {m.url}</a>}
          <div className="detail-content-card">
            <div className="detail-content-header">
              <span>{m.format === 'json' ? 'JSON' : m.format === 'markdown' || m.format === 'md' ? 'MARKDOWN' : m.format === 'html' ? 'HTML' : 'Content'}</span>
              <button className="copy-btn" title={T.copy} onClick={() => { navigator.clipboard.writeText(m.body || ''); showToast(T.copied, 'success'); const btn = document.querySelector('.detail-content-header .copy-btn'); if (btn) { btn.classList.add('copied'); setTimeout(() => btn.classList.remove('copied'), 1500) } }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              </button>
            </div>
            <div className={`detail-content-body ${bodyClass}`} dangerouslySetInnerHTML={{ __html: bodyHtml }} />
          </div>
          {tags.length > 0 && <><div className="detail-section-title">{T.tags}</div><div className="detail-tags">{tags.map(t => <span key={t} className="detail-tag">{t}</span>)}</div></>}
          {att && <><div className="detail-section-title">{T.attachment}</div>
            <div className="detail-att-card" onClick={async () => { try { await invoke('download_file', { url: att.url, filename: att.name || 'file' }) } catch {} }}>
              <span style={{fontSize:'20px'}}>📎</span>
              <div className="detail-att-info"><div className="detail-att-name">{att.name || 'file'}</div></div>
              <span style={{fontSize:'12px',color:'var(--accent)'}}>{T.download} →</span>
            </div>
          </>}
        </div>
      </div>
    )
  }, [app.detailMsg, T, showToast, invoke, escHtml, formatRelativeTime, parseTags, parseAttachment])

  // ── Close topic detail ──
  const closeTopicDetail = useCallback(() => {
    app.setTopicDetailKey(null)
    const bar = document.getElementById('topicDetailBar')
    const toolbar = document.getElementById('toolbarArea')
    if (bar) bar.style.display = 'none'
    if (toolbar) toolbar.style.display = ''
  }, [app])

  // ── Toggle view mode ──
  const toggleViewMode = useCallback(() => {
    const newMode = app.viewMode === 'messages' ? 'topics' : 'messages'
    app.setViewMode(newMode)
    localStorage.setItem('viewMode', newMode)
    closeTopicDetail()
  }, [app.viewMode, app.setViewMode, closeTopicDetail])

  // ── Filtered count for badge ──
  const unreadCount = app.allMessages.filter((m: Message) => !m.read).length

  return (
    <div className="view active" id="viewDashboard">
      <div className="header">
        <div className="header-left">
          <span id="connStatus" style={{fontSize:'12px',color:'var(--text3)',display:'flex',alignItems:'center',gap:'4px'}}>
            <span className={`status-dot ${app.connStatus.connected ? 'on' : 'off'}`}></span>
            <span id="connText">{app.connStatus.text}</span>
          </span>
        </div>
        <div className="header-actions">
          <button className="create-btn" id="composeBtn" title={T.composeTitle} onClick={() => app.setComposeOpen(true)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            <span id="t-compose-btn">{T.composeTitle}</span>
          </button>
          <button className={`icon-btn ${app.viewMode === 'topics' ? 'active' : ''}`} id="viewToggleBtn" title={app.viewMode === 'messages' ? T.topicView : T.messageView} onClick={toggleViewMode}>
            {app.viewMode === 'messages'
              ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"/></svg>
              : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16M4 9h16M4 14h16M4 19h16"/></svg>
            }
          </button>
          <button className="icon-btn" id="editConfigBtn" title={T.settings} onClick={() => app.setSettingsOpen(true)}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-header-left">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
            <h2 id="t-messages">{T.messages}{unreadCount > 0 && <span className="unread-badge" id="headerUnreadBadge">{unreadCount}</span>}</h2>
          </div>
          <div style={{display:'flex',gap:'6px',alignItems:'center'}}>
            <button className="icon-btn" id="markAllReadBtn" title={T.markAllRead} onClick={() => { app.markAllRead(); const btn = document.getElementById('markAllReadBtn'); if (btn) { btn.classList.remove('pulse-success'); void (btn as HTMLElement).offsetWidth; btn.classList.add('pulse-success') } }} style={{display: app.allMessages.length ? '' : 'none'}}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            </button>
            <button className="icon-btn danger" id="clearMsgsBtn" title={T.clearAll} onClick={() => app.showDeleteConfirm(T.clearConfirm, () => app.clearAll())} style={{display: app.allMessages.length ? '' : 'none'}}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        </div>

        {app.selectMode && (
          <div className="select-bar visible" id="selectBar">
            <div className="select-bar-left"><span id="selectCount">{app.selectedIds.size}</span> {T.selected}</div>
            <div className="select-bar-actions">
              <button className="icon-btn" id="selectAllBtn" title="Select All" onClick={() => { const filtered = getFilteredMessages(); if (app.selectedIds.size === filtered.length) app.setSelectedIds(new Set()); else app.setSelectedIds(new Set(filtered.map((m: Message) => m.id))) }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6 9 17l-5-5"/></svg>
              </button>
              <button className="icon-btn danger" id="deleteSelectedBtn" title="Delete" onClick={() => app.showDeleteConfirm(T.deleteConfirmTitle, () => app.deleteSelected())}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              </button>
              <button className="icon-btn" id="cancelSelectBtn" title="Cancel" onClick={() => { app.setSelectMode(false); app.setSelectedIds(new Set()) }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          </div>
        )}

        <div className="card-body-scroll">
          <div id="toolbarArea" style={{padding:'10px 14px',borderBottom:'1px solid var(--border)',flexShrink:0,display: app.topicDetailKey ? 'none' : undefined}}>
            <div className="toolbar">
              <div className="search-box">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input type="text" id="searchInput" placeholder={T.search} value={app.searchQuery} onChange={e => app.setSearchQuery(e.target.value)} />
              </div>
              <div className="filter-chips">
                {(['all','unread','read','flagged'] as const).map(f => (
                  <span key={f} className={`chip ${app.currentFilter === f ? 'active' : ''}`} data-filter={f} onClick={() => app.setCurrentFilter(f)}>{T[`filter${f.charAt(0).toUpperCase() + f.slice(1)}`]}</span>
                ))}
              </div>
            </div>
          </div>

          <div id="topicDetailBar" style={{display: app.topicDetailKey ? 'flex' : 'none',padding:'8px 14px',borderBottom:'1px solid var(--border)',flexShrink:0,alignItems:'center',gap:'10px'}}>
            <button className="icon-btn" id="topicDetailBackBtn" title="Back" style={{flexShrink:0}} onClick={closeTopicDetail}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>
            </button>
            <div id="topicDetailAvatar" className="topic-detail-avatar"></div>
            <span id="topicDetailTitle" style={{fontSize:'14px',fontWeight:600,flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}></span>
          </div>

          <div className="msg-scroll" id="msgListBody" ref={listRef} onClick={handleViewportClick}>
            <div className="msg-viewport" id="msgViewport" ref={viewportRef}></div>
          </div>
        </div>
      </div>

      {app.lastDeleted && (
        <div className="snackbar visible" id="undoSnackbar">
          <span id="snackbarText">{T.msgDeleted}</span>
          <button className="snackbar-undo" id="undoBtn" onClick={handleUndo}>{T.undo}</button>
        </div>
      )}

      {renderDetail()}
    </div>
  )
}
