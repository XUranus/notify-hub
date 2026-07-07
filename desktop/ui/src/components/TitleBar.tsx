interface Props {
  T: Record<string, string>
  invoke: (cmd: string) => Promise<any>
  connStatus: { text: string; connected: boolean }
  onCompose: () => void
  onViewToggle: () => void
  viewMode: string
  onSettings: () => void
  setErrorDetailOpen: (open: boolean) => void
}
export function TitleBar({ T, invoke, connStatus, onCompose, onViewToggle, viewMode, onSettings, setErrorDetailOpen }: Props) {
  return (
    <div id="titlebar">
      <div className="titlebar-left">
        <img src="logo-32.png" alt="" className="titlebar-logo" />
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
        <button className={`titlebar-btn ${viewMode !== 'messages' ? 'active' : ''}`} title={viewMode === 'messages' ? T.topicView : viewMode === 'topics' ? T.cardView : T.messageView} onClick={onViewToggle}>
          {viewMode === 'messages'
            ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" /></svg>
            : viewMode === 'topics'
            ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>
            : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16M4 9h16M4 14h16M4 19h16" /></svg>
          }
        </button>
        <button className="titlebar-btn" title={T.settings} onClick={onSettings}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></svg>
        </button>
        <button className="titlebar-close" title="Close" onClick={() => invoke('window_close')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="6" y1="6" x2="18" y2="18"/><line x1="6" y1="18" x2="18" y2="6"/></svg>
        </button>
      </div>
    </div>
  )
}
