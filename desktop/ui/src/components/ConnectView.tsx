import { useState } from 'react'
import { DEFAULT_SERVER_URL } from '../lib/constants'

interface Props {
  T: Record<string, string>
  onConnect: (url: string, username: string, password: string) => Promise<void>
  showToast: (text: string, type?: string) => void
}

export function ConnectView({ T, onConnect, showToast }: Props) {
  const [url, setUrl] = useState(() => {
    // Try localStorage first, then config file
    const saved = localStorage.getItem('serverUrl')
    if (saved) return saved
    // Fallback: read from config file via Tauri
    try {
      const invoke = window.__TAURI_INTERNALS__.invoke
      invoke('get_config').then((cfg: any) => {
        if (cfg?.server?.url) setUrl(cfg.server.url)
      })
    } catch {}
    return ''
  })
  const [username, setUsername] = useState(() => {
    // Try localStorage first, then config file
    const saved = localStorage.getItem('username')
    if (saved) return saved
    // Fallback: read from config file via Tauri
    try {
      const invoke = window.__TAURI_INTERNALS__.invoke
      invoke('get_config').then((cfg: any) => {
        if (cfg?.server?.username) setUsername(cfg.server.username)
      })
    } catch {}
    return ''
  })
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleConnect = async () => {
    if (loading || !url.trim() || !username.trim()) return
    setLoading(true)
    try { await onConnect(url, username, password) }
    catch (e) { showToast(`${T.error}: ${e}`, 'error') }
    finally { setLoading(false) }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleConnect()
  }

  return (
    <div className="view active" id="viewConnect">
      <div className="header">
        <div className="header-left">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
          <h1>NotifyHub Client</h1>
        </div>
      </div>
      <div className="card">
        <div className="card-header">
          <div className="card-header-left">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><circle cx="6" cy="6" r="1"/><circle cx="6" cy="18" r="1"/></svg>
            <h2 id="t-server-config">{T.serverConfig}</h2>
          </div>
        </div>
        <div className="card-body">
          <div className="field"><label htmlFor="c-url">URL</label><input type="text" id="c-url" placeholder={DEFAULT_SERVER_URL} value={url} onChange={e => setUrl(e.target.value)} onKeyDown={handleKeyDown} /></div>
          <div className="field"><label htmlFor="c-username" id="t-username-label">{T.username}</label><input type="text" id="c-username" placeholder="admin@example.com" value={username} onChange={e => setUsername(e.target.value)} onKeyDown={handleKeyDown} /></div>
          <div className="field"><label htmlFor="c-password" id="t-password-label">Password</label><input type="password" id="c-password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={handleKeyDown} /></div>
          <button className="btn-primary" id="connectBtn" onClick={handleConnect} disabled={loading}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
            <span id="t-connect-btn">{loading ? T.connecting : T.connectBtn}</span>
          </button>
          <div className="status" id="connectStatus" style={{marginTop:'10px',fontSize:'13px'}}></div>
        </div>
      </div>
    </div>
  )
}
