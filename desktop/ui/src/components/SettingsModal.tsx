import { useState, useEffect, useCallback } from 'react'
import { api } from '../lib/tauri'

/** Replace /home/user or $HOME prefix with ~ */
function shortenPath(p: string): string {
  if (!p) return p
  // Replace $HOME prefix
  if (p.startsWith('$HOME/')) return '~/' + p.slice(6)
  if (p === '$HOME') return '~'
  // Replace /home/username or /root prefix
  const m = p.match(/^\/home\/[^/]+/)
  if (m) return '~' + p.slice(m[0].length)
  if (p.startsWith('/root/')) return '~/' + p.slice(6)
  if (p === '/root') return '~'
  return p
}

interface Props { app: any }

export function SettingsModal({ app }: Props) {
  const { T, lang, setLang, theme, setTheme, colorScheme, setColorScheme, colorSchemes, fontSize, fontFamily, setFontSize, setFontFamily, fontSizes, fontFamilies, showToast, invoke } = app
  const [tab, setTab] = useState('server')
  const [cfg, setCfg] = useState<any>(null)
  const [sysInfo, setSysInfo] = useState<any>(null)
  const [appInfo, setAppInfo] = useState<any>(null)
  const [clientName, setClientName] = useState('')
  const [autostart, setAutostart] = useState(false)
  const [autoDownload, setAutoDownload] = useState(false)
  const [connectionMode, setConnectionMode] = useState('sse')
  const [modeSwitching, setModeSwitching] = useState(false)
  const [logLevel, setLogLevel] = useState('info')
  const [logRetention, setLogRetention] = useState(30)
  const [logFilePath, setLogFilePath] = useState('')
  const [systemFonts, setSystemFonts] = useState<string[]>([])

  const loadSystemTab = useCallback(async () => {
    try { const c = await invoke('get_config'); if (c) { setCfg(c); setClientName(c.client.name) } } catch {}
    try { setSysInfo(await invoke('get_system_info')) } catch {}
    try { setAppInfo(await invoke('get_app_info')) } catch {}
    try { setAutostart(await invoke('get_autostart')) } catch {}
    try { const c = await invoke('get_config'); if (c) setAutoDownload(!!c.auto_download_images) } catch {}
    try { const m = await invoke('get_connection_mode'); setConnectionMode(m || 'sse') } catch {}
    try { const ls = await invoke('get_log_settings'); if (ls) { setLogLevel(ls.level || 'info'); setLogRetention(ls.retentionDays || 30); setLogFilePath(ls.logPath || '') } } catch {}
    try { const fonts = await api.getSystemFonts(); setSystemFonts(fonts || []) } catch {}
  }, [invoke])

  useEffect(() => { if (app.settingsOpen) loadSystemTab() }, [app.settingsOpen, loadSystemTab])

  if (!app.settingsOpen) return null

  const schemeColors: Record<string, string> = {
    purple: '#5b21b6', blue: '#1565c0', teal: '#00796b',
    green: '#2e7d32', orange: '#e65100', rose: '#ad1457',
  }
  const schemeLabels: Record<string, string> = {
    purple: T.schemePurple, blue: T.schemeBlue, teal: T.schemeTeal,
    green: T.schemeGreen, orange: T.schemeOrange, rose: T.schemeRose,
  }

  const toggleAutostart = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setAutostart(e.target.checked)
    try { await invoke('set_autostart', { enabled: e.target.checked }) } catch { setAutostart(!e.target.checked) }
  }

  const toggleAutoDownload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setAutoDownload(e.target.checked)
    try { const c = await invoke('get_config'); c.auto_download_images = e.target.checked; await invoke('save_config', { cfg: c }) } catch { setAutoDownload(!e.target.checked) }
  }

  const handleLogout = async () => {
    if (!confirm(`${T.logout}?`)) return
    try { await invoke('logout'); app.setSettingsOpen(false); window.location.reload() } catch (e) { showToast(`${T.error}: ${e}`, 'error') }
  }

  const handleSaveName = async () => {
    try { await invoke('update_client_name', { name: clientName }); showToast(T.saved, 'success') } catch (e) { showToast(`${T.error}: ${e}`, 'error') }
  }

  const handleBackup = async () => {
    try {
      const json = await invoke('backup_messages_json')
      const { save } = await import('@tauri-apps/plugin-dialog')
      const fp = await save({ defaultPath: 'notifyhub-backup.json', filters: [{ name: 'JSON', extensions: ['json'] }] })
      if (fp) { const { writeTextFile } = await import('@tauri-apps/plugin-fs'); await writeTextFile(fp, json); showToast(T.backupSuccess, 'success') }
    } catch (e) { showToast(`${T.error}: ${e}`, 'error') }
  }

  const handleRestore = async () => {
    if (!confirm(T.restoreConfirm)) return
    try {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const fp = await open({ filters: [{ name: 'JSON', extensions: ['json'] }], multiple: false })
      if (fp) {
        const { readTextFile } = await import('@tauri-apps/plugin-fs')
        const text = await readTextFile(fp as string)
        const count = await invoke('restore_messages_json', { json: text })
        showToast(T.restoreSuccess.replace('{count}', String(count)), 'success')
        app.refreshMessages()
      }
    } catch (e) { showToast(`${T.restoreFailed}: ${e}`, 'error') }
  }

  const handleExport = async (fmt: 'csv' | 'xml' | 'json') => {
    try {
      const fn = fmt === 'csv' ? 'export_messages_csv' : fmt === 'xml' ? 'export_messages_xml' : 'export_messages_json'
      const data = await invoke(fn)
      const { save } = await import('@tauri-apps/plugin-dialog')
      const fp = await save({ defaultPath: `messages.${fmt}`, filters: [{ name: fmt.toUpperCase(), extensions: [fmt] }] })
      if (fp) { const { writeTextFile } = await import('@tauri-apps/plugin-fs'); await writeTextFile(fp, data); showToast(T.exportSuccess.replace('{format}', fmt.toUpperCase()), 'success') }
    } catch (e) { showToast(`${T.error}: ${e}`, 'error') }
  }

  const handleTestSend = async () => {
    try { if (!cfg) return; await invoke('send_message', { msg: { channel: 'push', title: 'Test', body: 'Hello from Tools', clientUuid: cfg.client.uuid } }); showToast(T.composeSent, 'success') } catch (e) { showToast(`${T.error}: ${e}`, 'error') }
  }

  return (
    <div className="modal-overlay open" id="configModal" onClick={() => app.setSettingsOpen(false)}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 id="t-edit-config">{T.settings}</h3>
          <button className="modal-close" id="modalCloseBtn" onClick={() => app.setSettingsOpen(false)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div className="tabs">
          <button className={`tab ${tab === 'server' ? 'active' : ''}`} onClick={() => setTab('server')}>{T.tabServer}</button>
          <button className={`tab ${tab === 'settings' ? 'active' : ''}`} onClick={() => setTab('settings')}>{T.tabSettings || 'Settings'}</button>
          <button className={`tab ${tab === 'data' ? 'active' : ''}`} onClick={() => setTab('data')}>{T.tabData}</button>
          <button className={`tab ${tab === 'about' ? 'active' : ''}`} onClick={() => setTab('about')}>{T.about}</button>
        </div>

        {/* ── Server Tab ── */}
        {tab === 'server' && (
          <div className="tab-pane active">
            <div className="modal-body">
              <div className="info-list">
                <div className="info-row"><span className="info-label">URL</span><span className="info-value mono">{cfg?.server?.url || '—'}</span></div>
                <div className="info-row"><span className="info-label">{T.username}</span><span className="info-value">{cfg?.server?.username || '—'}</span></div>
                <div className="info-row"><span className="info-label">{T.name}</span><input type="text" placeholder="My Desktop" value={clientName} onChange={e => setClientName(e.target.value)} style={{ minWidth: '120px', maxWidth: '180px', flex: 1, padding: '6px 12px', border: '1px solid var(--outline-variant)', borderRadius: '12px', fontSize: '13px', color: 'var(--text)', background: 'var(--input-bg)', fontFamily: 'inherit' }} /></div>
              </div>
              <div className="appearance-row" style={{ marginTop: '12px' }}>
                <label className="appearance-label">{T.connectionMode}</label>
                <select className="appearance-select" value={connectionMode} disabled={modeSwitching} onChange={async e => {
                  const newMode = e.target.value
                  if (newMode === connectionMode) return
                  setConnectionMode(newMode)
                  setModeSwitching(true)
                  try {
                    await invoke('set_connection_mode', { mode: newMode })
                  } catch (err) {
                    console.error('Failed to switch mode:', err)
                  } finally {
                    setModeSwitching(false)
                  }
                }}>
                  <option value="sse">SSE (Server-Sent Events)</option>
                  <option value="ws">WebSocket</option>
                  <option value="poll">Polling (5s interval)</option>
                </select>
                {modeSwitching && (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                    marginLeft: '8px', fontSize: '12px', color: 'var(--text-secondary, #888)'
                  }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" style={{ animation: 'spin 1s linear infinite' }}>
                      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="31.4" strokeDashoffset="10" />
                    </svg>
                    {T.connecting || 'Connecting...'}
                  </span>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-cancel" onClick={() => app.setSettingsOpen(false)}>{T.cancel}</button>
              <button className="btn-save" onClick={handleSaveName}>{T.saveDeviceBtn}</button>
            </div>
            <div style={{ padding: '0 20px 16px', display: 'flex', justifyContent: 'center' }}>
              <button className="btn-cancel" style={{ color: 'var(--err,#ef4444)', borderColor: 'var(--err,#ef4444)', fontSize: '13px' }} onClick={handleLogout}>{T.logout}</button>
            </div>
          </div>
        )}

        {/* ── Settings Tab ── */}
        {tab === 'settings' && (
          <div className="tab-pane active">
            <div className="modal-body">
              <div className="detail-section-title" style={{ marginBottom: '10px' }}>{T.behavior || 'Behavior'}</div>
              <div className="autostart-row">
                <label className="toggle-label">{T.autostart}</label>
                <label className="toggle"><input type="checkbox" checked={autostart} onChange={toggleAutostart} /><span className="toggle-slider"></span></label>
              </div>
              <div className="autostart-row">
                <label className="toggle-label">{T.autoDownloadImages}</label>
                <label className="toggle"><input type="checkbox" checked={autoDownload} onChange={toggleAutoDownload} /><span className="toggle-slider"></span></label>
              </div>

              <hr className="section-divider" />
              <div className="detail-section-title" style={{ marginBottom: '10px' }}>{T.appearance || 'Appearance'}</div>
              <div className="appearance-row">
                <label className="appearance-label">{T.language}</label>
                <select className="appearance-select" value={lang} onChange={e => setLang(e.target.value as any)}>
                  <option value="en">English</option><option value="zh">中文</option><option value="ja">日本語</option><option value="ko">한국어</option>
                </select>
              </div>
              <div className="appearance-row">
                <label className="appearance-label">{T.theme}</label>
                <select className="appearance-select" value={theme} onChange={e => setTheme(e.target.value)}>
                  <option value="system">{T.themeSystem}</option><option value="light">{T.themeLight}</option><option value="dark">{T.themeDark}</option>
                </select>
              </div>
              <div className="appearance-row">
                <label className="appearance-label">{T.colorScheme}</label>
                <div className="color-swatches">
                  {colorSchemes.map((s: string) => (
                    <button key={s} className={`color-swatch ${colorScheme === s ? 'active' : ''}`} style={{ background: schemeColors[s] }} title={schemeLabels[s]} onClick={() => setColorScheme(s)} />
                  ))}
                </div>
              </div>
              <div className="appearance-row">
                <label className="appearance-label">{T.fontSize || 'Font Size'}</label>
                <select className="appearance-select" value={fontSize} onChange={e => setFontSize(e.target.value)}>
                  {fontSizes.map((s: string) => <option key={s} value={s}>{s}px</option>)}
                </select>
              </div>
              <div className="appearance-row">
                <label className="appearance-label">{T.fontFamily || 'Font'}</label>
                <select className="appearance-select" value={fontFamily} onChange={e => setFontFamily(e.target.value)}>
                  {fontFamilies.map((f: any) => <option key={f.value} value={f.value} style={{ fontFamily: f.value || undefined }}>{f.label}</option>)}
                  {systemFonts.length > 0 && <option disabled>──────────</option>}
                  {systemFonts.map((f: string) => <option key={f} value={`"${f}"`} style={{ fontFamily: `"${f}"` }}>{f}</option>)}
                </select>
              </div>

              <hr className="section-divider" />
              <div className="detail-section-title" style={{ marginBottom: '10px' }}>Logging</div>
              <div className="appearance-row">
                <label className="appearance-label">{T.logLevel}</label>
                <select className="appearance-select" value={logLevel} onChange={async e => {
                  setLogLevel(e.target.value)
                  try { await invoke('set_log_level', { level: e.target.value }) } catch { /* revert handled by reload */ }
                }}>
                  <option value="error">ERROR</option>
                  <option value="info">INFO</option>
                  <option value="debug">DEBUG</option>
                </select>
              </div>
              <div className="appearance-row">
                <label className="appearance-label">{T.logRetention}</label>
                <select className="appearance-select" value={logRetention} onChange={async e => {
                  const days = Number(e.target.value)
                  setLogRetention(days)
                  try { await invoke('set_log_retention', { days }) } catch {}
                }}>
                  <option value="7">{T.logRetentionWeek}</option>
                  <option value="30">{T.logRetentionMonth}</option>
                  <option value="365">{T.logRetentionYear}</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* ── Data Tab ── */}
        {tab === 'data' && (
          <div className="tab-pane active">
            <div className="modal-body">
              <div style={{ marginBottom: '16px' }}>
                <div className="detail-section-title" style={{ marginBottom: '10px' }}>{T.backupRestore}</div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button className="btn-primary" style={{ flex: 1, minWidth: '120px' }} onClick={handleBackup}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                    <span>{T.backup}</span>
                  </button>
                  <button className="btn-primary" style={{ flex: 1, minWidth: '120px', background: 'var(--success)' }} onClick={handleRestore}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    <span>{T.restore}</span>
                  </button>
                </div>
              </div>
              <div>
                <div className="detail-section-title" style={{ marginBottom: '10px' }}>{T.export}</div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {(['csv', 'xml', 'json'] as const).map(fmt => (
                    <button key={fmt} className="btn-cancel" style={{ flex: 1, minWidth: '80px' }} onClick={() => handleExport(fmt)}>{fmt.toUpperCase()}</button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── About Tab ── */}
        {tab === 'about' && (
          <div className="tab-pane active">
            <div className="modal-body">
              <div className="info-list">
                <div className="info-row"><span className="info-label">UUID</span><span className="info-value mono" style={{ cursor: 'pointer', fontWeight: 600 }} onClick={() => { navigator.clipboard.writeText(cfg?.client?.uuid || ''); showToast(T.copied, 'success') }}>{cfg?.client?.uuid || '—'}</span></div>
                {sysInfo && <div className="info-row"><span className="info-label">{T.system}</span><span className="info-value">{sysInfo.os} / {sysInfo.arch} / {sysInfo.desktop_env}</span></div>}
                <div className="info-row"><span className="info-label">{T.messages}</span><span className="info-value">{app.allMessages.length}</span></div>
                {appInfo && <>
                  <div className="info-row"><span className="info-label">{T.appVersion}</span><span className="info-value">{appInfo.version}</span></div>
                  <div className="info-row"><span className="info-label">{T.configFile}</span><span className="info-value mono">{shortenPath(appInfo.config_path)}</span></div>
                  <div className="info-row"><span className="info-label">{T.messagesFile}</span><span className="info-value mono">{shortenPath(appInfo.messages_path)}</span></div>
                  {logFilePath && <div className="info-row"><span className="info-label">{T.logDir}</span><span className="info-value mono">{shortenPath(logFilePath.substring(0, logFilePath.lastIndexOf('/')))}</span></div>}
                </>}
              </div>
              <hr className="section-divider" />
              <div className="info-list">
                <a className="info-row" href="https://github.com/XUranus/NotifyHub" target="_blank" style={{ cursor: 'pointer', textDecoration: 'none', color: 'inherit' }}><span className="info-label">{T.aboutGithub}</span><span className="info-value" style={{ color: 'var(--accent)' }}>github.com/XUranus/NotifyHub</span></a>
                <a className="info-row" href="https://xuranus.github.com/notify-hub" target="_blank" style={{ cursor: 'pointer', textDecoration: 'none', color: 'inherit' }}><span className="info-label">{T.aboutDocs}</span><span className="info-value" style={{ color: 'var(--accent)' }}>xuranus.github.com/notify-hub</span></a>
                <a className="info-row" href="mailto:xuranus@foxmail.com" style={{ cursor: 'pointer', textDecoration: 'none', color: 'inherit' }}><span className="info-label">{T.aboutEmail}</span><span className="info-value" style={{ color: 'var(--accent)' }}>xuranus@foxmail.com</span></a>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
