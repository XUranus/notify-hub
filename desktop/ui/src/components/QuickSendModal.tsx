import { useState } from 'react'

interface Props { app: any }

export function QuickSendModal({ app }: Props) {
  const { T, showToast, invoke } = app
  const [sending, setSending] = useState(false)

  if (!app.quickSendOpen) return null

  const handleSend = async () => {
    setSending(true)
    try {
      const cfg = await invoke('get_config')
      await invoke('send_message', { msg: { channel:'push', title:'Quick Test', body:'Hello from Quick Send', clientUuid: cfg.client.uuid } })
      showToast(T.composeSent, 'success')
      app.setQuickSendOpen(false)
    } catch (e) { showToast(`${T.error}: ${e}`, 'error') }
    finally { setSending(false) }
  }

  return (
    <div className="modal-overlay open" id="quickSendModal" onClick={() => app.setQuickSendOpen(false)}>
      <div className="modal" style={{width:'640px',maxWidth:'92vw'}} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 style={{display:'flex',alignItems:'center',gap:'8px'}}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            <span id="t-qs-title">{T.quickSendTitle}</span>
          </h3>
          <button className="modal-close" id="quickSendCloseBtn" onClick={() => app.setQuickSendOpen(false)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div className="modal-body" style={{textAlign:'center',padding:'30px'}}>
          <p style={{color:'var(--text2)',marginBottom:'20px'}}>{T.quickSendMsg}</p>
        </div>
        <div className="modal-footer">
          <div className="compose-status" id="qsStatus"></div>
          <button className="btn-cancel" id="quickSendCancelBtn" onClick={() => app.setQuickSendOpen(false)}>{T.cancel}</button>
          <button className="btn-save" id="quickSendRunBtn" style={{background:'var(--success)'}} onClick={handleSend} disabled={sending}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            <span id="t-qs-run">{sending ? T.composeSending : T.quickSendRun}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
