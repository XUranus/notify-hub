interface Props { T: Record<string, string>; invoke: (cmd: string) => Promise<any> }
export function TitleBar({ T, invoke }: Props) {
  return (
    <div id="titlebar">
      <div className="titlebar-drag" data-tauri-drag-region>
        <img src="logo-32.png" alt="" className="titlebar-logo" />
        <span>NotifyHub</span>
      </div>
      <div className="titlebar-controls">
        <button id="titlebarMinimize" title="Minimize" onClick={() => invoke('window_minimize')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
        <button id="titlebarMaximize" title="Maximize" onClick={() => invoke('window_toggle_maximize')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="5" y="5" width="14" height="14" rx="1"/></svg>
        </button>
        <button id="titlebarClose" className="titlebar-close" title="Close" onClick={() => invoke('window_close')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="6" y1="6" x2="18" y2="18"/><line x1="6" y1="18" x2="18" y2="6"/></svg>
        </button>
      </div>
    </div>
  )
}
