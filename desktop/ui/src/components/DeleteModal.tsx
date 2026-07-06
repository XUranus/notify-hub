interface Props { app: any }
export function DeleteModal({ app }: Props) {
  if (!app.deleteModalOpen) return null
  return (
    <div className="modal-overlay open" id="deleteModal" onClick={() => app.setDeleteModalOpen(false)}>
      <div className="modal" style={{maxWidth:'400px'}} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 id="t-delete-confirm-title">{app.T.deleteConfirmTitle}</h3>
          <button className="modal-close" id="deleteModalClose" onClick={() => app.setDeleteModalOpen(false)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div className="modal-body">
          <p id="deleteModalText" style={{fontSize:'14px',color:'var(--text)'}}>{app.deleteModalText}</p>
        </div>
        <div className="modal-footer">
          <button className="btn-cancel" id="deleteModalCancel" onClick={() => app.setDeleteModalOpen(false)}>{app.T.cancel}</button>
          <button className="btn-save" id="deleteModalConfirm" style={{background:'var(--error)'}} onClick={() => { app.deleteModalCallback?.(); app.setDeleteModalOpen(false) }}>{app.T.delete}</button>
        </div>
      </div>
    </div>
  )
}
