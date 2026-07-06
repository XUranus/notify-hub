interface Props { toast: { text: string; type: string; visible: boolean } }
export function Toast({ toast }: Props) {
  return (
    <div className={`toast ${toast.visible ? 'visible' : ''} ${toast.type}`} id="toast">
      <span className="toast-icon" id="toastIcon">{toast.type === 'success' ? '✓' : toast.type === 'error' ? '✕' : 'ℹ'}</span>
      <span className="toast-text" id="toastText">{toast.text}</span>
      <button className="toast-close" id="toastClose">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
  )
}
