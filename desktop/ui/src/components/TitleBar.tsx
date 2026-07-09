import { useState, useRef, useEffect } from 'react'

interface Props {
  T: Record<string, string>
  invoke: (cmd: string) => Promise<any>
  connStatus: { text: string; connected: boolean }
  onCompose: () => void
  onViewToggle: () => void
  viewMode: string
  onSettings: () => void
  setErrorDetailOpen: (open: boolean) => void
  showSearch: boolean
  onToggleSearch: () => void
  unreadCount: number
  hasMessages: boolean
  onMarkAllRead: () => void
  onClearAll: () => void
  currentFilter: string
  onSetFilter: (f: string) => void
  detailMsg?: any
  topicDetailKey?: string | null
}
export function TitleBar({ T, invoke, connStatus, onCompose, onViewToggle, viewMode, onSettings, setErrorDetailOpen, showSearch, onToggleSearch, unreadCount, hasMessages, onMarkAllRead, onClearAll, currentFilter, onSetFilter, detailMsg, topicDetailKey }: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const filterRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  useEffect(() => {
    if (!filterOpen) return
    const handler = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setFilterOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [filterOpen])

  return (
    <div id="titlebar">
      <div className="titlebar-left">
        {unreadCount > 0 && <span className="titlebar-unread-dot" title={`${unreadCount}`}>{unreadCount > 99 ? '99+' : unreadCount}</span>}
        <span id="connStatus" style={{fontSize:'11px',color:'var(--text3)',display:'flex',alignItems:'center',gap:'4px'}}>
          {connStatus.connected ? (
            <>
              <span className="status-dot on"></span>
              <span>{connStatus.text}</span>
            </>
          ) : (
            <span
              className="conn-error-icon"
              title={connStatus.text}
              onClick={() => setErrorDetailOpen(true)}
              style={{cursor:'pointer',display:'flex',alignItems:'center',gap:'4px',color:'var(--error)'}}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="2" y1="2" x2="22" y2="22" />
                <path d="M8.5 16.5a5 5 0 0 1 7 0" />
                <path d="M2 8.82a15 15 0 0 1 4.17-2.65" />
                <path d="M10.66 5c4.01-.36 8.14.9 11.34 3.76" />
                <path d="M16.85 11.25a10 10 0 0 1 2.22 1.68" />
                <path d="M5 12.86a10 10 0 0 1 5.17-2.86" />
                <line x1="12" y1="20" x2="12.01" y2="20" />
              </svg>
              <span style={{fontSize:'10px'}}>{T.offlineStatus}</span>
            </span>
          )}
        </span>
      </div>
      <div className="titlebar-controls">
        <button className="titlebar-btn" title={T.composeTitle} onClick={onCompose}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
        </button>
        <button className={`titlebar-btn ${showSearch ? 'active' : ''}`} title={T.search || 'Search'} onClick={onToggleSearch}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
        </button>
        <div className="titlebar-menu-wrapper" ref={filterRef}>
          <button className={`titlebar-btn ${currentFilter !== 'all' ? 'active' : ''}`} title={T.filterAll} onClick={() => setFilterOpen(v => !v)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></svg>
          </button>
          {filterOpen && (
            <div className="titlebar-dropdown">
              {(['all','unread','read','flagged'] as const).map(f => (
                <button key={f} className={`titlebar-dropdown-item ${currentFilter === f ? 'active' : ''}`} onClick={() => { setFilterOpen(false); onSetFilter(f) }}>
                  <span className={`check-icon ${currentFilter === f ? '' : 'hidden'}`}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
                  </span>
                  {T[`filter${f.charAt(0).toUpperCase() + f.slice(1)}`]}
                </button>
              ))}
            </div>
          )}
        </div>
        <button className={`titlebar-btn ${viewMode !== 'messages' ? 'active' : ''} ${detailMsg || topicDetailKey ? 'disabled' : ''}`} title={viewMode === 'messages' ? T.topicView : viewMode === 'topics' ? T.cardView : T.messageView} onClick={() => { if (!detailMsg && !topicDetailKey) onViewToggle() }}>
          {viewMode === 'messages'
            ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" /></svg>
            : viewMode === 'topics'
            ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>
            : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16M4 9h16M4 14h16M4 19h16" /></svg>
          }
        </button>
        <div className="titlebar-menu-wrapper" ref={menuRef}>
          <button className="titlebar-btn" title={T.settings} onClick={() => setMenuOpen(v => !v)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" /></svg>
          </button>
          {menuOpen && (
            <div className="titlebar-dropdown">
              <button className="titlebar-dropdown-item" disabled={!hasMessages} onClick={() => { setMenuOpen(false); onMarkAllRead() }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
                {T.markAllRead}
              </button>
              <button className="titlebar-dropdown-item" disabled={!hasMessages} onClick={() => { setMenuOpen(false); onClearAll() }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                {T.clearAll}
              </button>
              <div className="titlebar-dropdown-sep" />
              <button className="titlebar-dropdown-item" onClick={() => { setMenuOpen(false); onSettings() }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></svg>
                {T.settings}
              </button>
            </div>
          )}
        </div>
        <button className="titlebar-close" title="Close" onClick={() => invoke('window_close')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="6" y1="6" x2="18" y2="18"/><line x1="6" y1="18" x2="18" y2="6"/></svg>
        </button>
      </div>
    </div>
  )
}
