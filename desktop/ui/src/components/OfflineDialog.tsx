interface Props { app: any }
export function OfflineDialog({ app }: Props) {
  if (!app.offlineOpen) return null
  return (
    <div className="modal-overlay open" id="offlineModal" onClick={() => { app.setOfflineOpen(false); app.setOfflineMode(true) }}>
      <div className="modal" style={{width:'400px',maxWidth:'90vw'}} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 style={{display:'flex',alignItems:'center',gap:'8px'}}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{color:'var(--warn)'}}><line x1="1" y1="1" x2="23" y2="23"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/><path d="M10.71 5.05A16 16 0 0 1 22.56 9"/><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>
            <span id="t-offline-title">{app.T.offlineTitle}</span>
          </h3>
        </div>
        <div style={{padding:'20px',textAlign:'center'}}>
          <p id="t-offline-message" style={{color:'var(--text2)',margin:'0 0 20px'}}>{app.T.offlineMessage}</p>
          <div style={{display:'flex',gap:'10px',justifyContent:'center'}}>
            <button className="btn-cancel" id="offlineSwitchBtn" onClick={() => { app.setOfflineOpen(false); app.setCurrentView('connect') }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{verticalAlign:'-2px'}}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              <span id="t-offline-switch">{app.T.offlineSwitch}</span>
            </button>
            <button className="btn-save" id="offlineCancelBtn" style={{background:'var(--text3)'}} onClick={() => { app.setOfflineOpen(false); app.setOfflineMode(true) }}>
              <span id="t-offline-offline">{app.T.offlineMode}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
