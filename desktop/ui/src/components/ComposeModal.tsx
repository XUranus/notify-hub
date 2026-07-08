import { useState, useEffect, useCallback, useRef } from 'react'
import { SiApple, SiAndroid, SiLinux } from 'react-icons/si'
import { LuMonitor } from 'react-icons/lu'

interface Props { app: any }

interface Client { uuid: string; name: string | null; deviceName: string | null; os: string | null; deviceOs: string | null; arch: string | null; deviceArch: string | null; desktop: string | null; appVersion: string | null; platform: string | null; connectionMode: string | null; lastSeenAt: number | null }

function fmtBytes(bytes: number): string {
  if (bytes < 1024) return bytes + 'B'
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + 'KB'
  return (bytes / 1048576).toFixed(1) + 'MB'
}

// OS Icons from react-icons
const OsIcons = {
  android: <SiAndroid size={16} />,
  ios: <SiApple size={16} />,
  macos: <SiApple size={16} />,
  windows: <LuMonitor size={16} />,
  linux: <SiLinux size={16} />,
  default: <LuMonitor size={16} />,
}

export function ComposeModal({ app }: Props) {
  const { T, showToast, invoke } = app
  const [channel, setChannel] = useState('push')
  const [format, setFormat] = useState('auto')
  const [to, setTo] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [attachmentUrl, setAttachmentUrl] = useState('')
  const [attachmentName, setAttachmentName] = useState('')
  const [priority, setPriority] = useState('0')
  const [url, setUrl] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [sending, setSending] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [clients, setClients] = useState<Client[]>([])
  const [loadingClients, setLoadingClients] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Load clients when channel is 'push'
  const loadClients = useCallback(async () => {
    setLoadingClients(true)
    try {
      const data = await invoke('get_clients')
      const clientList = data || []
      setClients(clientList)
      // Set default to broadcast if no selection
      if (!to && clientList.length > 0) {
        setTo('*')
      }
    } catch { setClients([]) }
    finally { setLoadingClients(false) }
  }, [invoke, to])

  useEffect(() => {
    if (app.composeOpen && channel === 'push') loadClients()
  }, [app.composeOpen, channel, loadClients])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  if (!app.composeOpen) return null

  // Auto-detect text format
  const detectFormat = (text: string): string => {
    const trimmed = text.trim()
    if (!trimmed) return 'text'

    // Check for JSON
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
        (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try { JSON.parse(trimmed); return 'json' } catch {}
    }

    // Check for HTML
    if (/<[a-z][\s\S]*>/i.test(trimmed) && (
      trimmed.includes('</') ||
      /<(br|hr|img|input|meta|link)\s*\/?>/i.test(trimmed)
    )) {
      return 'html'
    }

    // Check for Markdown
    const mdPatterns = [
      /^#{1,6}\s+/m,           // Headers
      /\*\*[^*]+\*\*/,         // Bold
      /\*[^*]+\*/,             // Italic
      /`[^`]+`/,               // Inline code
      /```[\s\S]*```/,         // Code blocks
      /^\s*[-*+]\s+/m,         // Lists
      /^\s*\d+\.\s+/m,         // Numbered lists
      /\[([^\]]+)\]\(([^)]+)\)/, // Links
      /!\[([^\]]*)\]\(([^)]+)\)/, // Images
      /^\s*>/m,                // Blockquotes
      /^\s*---\s*$/m,          // Horizontal rules
      /\|[^|]+\|[^|]+\|/,     // Tables
    ]
    const mdScore = mdPatterns.reduce((score, pattern) => score + (pattern.test(trimmed) ? 1 : 0), 0)
    if (mdScore >= 2) return 'markdown'

    return 'text'
  }

  const handleSend = async () => {
    const toValue = to
    if (!toValue) { showToast(`${T.composeTo} is required`, 'error'); return }

    const hasAttachment = !!attachmentUrl
    const hasSubject = !!subject.trim()
    const hasBody = !!body.trim()

    // If no attachment, require subject or body
    if (!hasAttachment && !hasSubject && !hasBody) {
      showToast(`${T.composeSubject} / ${T.composeBody} required`, 'error')
      return
    }

    // Auto-fill subject with 'Attachment' if empty when attachment exists
    const finalSubject = hasSubject ? subject.trim() : (hasAttachment ? (T.attachment || 'Attachment') : null)

    setSending(true)
    try {
      // Detect format if auto
      const detectedFormat = format === 'auto' ? detectFormat(body) : format
      const args: any = {
        channel,
        to: toValue,
        subject: finalSubject,
        body: body.trim() || null,
        tags: tags.length > 0 ? tags : null,
        priority: parseInt(priority) > 0 ? parseInt(priority) : null,
        url: url.trim() || null,
        format: detectedFormat !== 'text' ? detectedFormat : null,
      }
      if (hasAttachment) {
        args.attachment = { name: attachmentName || attachmentUrl.split('/').pop() || 'attachment', url: attachmentUrl }
      }
      await invoke('send_message', args)
      showToast(T.composeSent, 'success')
      app.setComposeOpen(false)
      // Reset form
      setBody(''); setSubject(''); setTo(''); setAttachmentUrl(''); setAttachmentName(''); setTags([]); setPriority('0'); setUrl('')
    } catch (e) { showToast(`${T.error}: ${e}`, 'error') }
    finally { setSending(false) }
  }

  const handleTagKeydown = (e: React.KeyboardEvent) => {
    if ((e.key === 'Enter' || e.key === ',') && tagInput.trim()) {
      e.preventDefault()
      const val = tagInput.trim().replace(/,/g, '')
      if (val && !tags.includes(val)) setTags([...tags, val])
      setTagInput('')
    }
    else if (e.key === 'Backspace' && !tagInput && tags.length) setTags(tags.slice(0, -1))
  }

  // Upload file handler — uses native file input (same as original HTML)
  const handleUpload = () => {
    const fileInput = document.createElement('input')
    fileInput.type = 'file'
    fileInput.style.display = 'none'
    document.body.appendChild(fileInput)

    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0]
      if (!file) { fileInput.remove(); return }
      fileInput.remove()

      setUploading(true)
      try {
        const cfg = await invoke('get_config')
        const serverUrl = (cfg.server.url as string).replace(/\/+$/, '')
        const apiKey = cfg.server.jwt

        // Check quota
        const quotaResp = await fetch(serverUrl + '/api/user/upload/quota', {
          headers: { 'Authorization': 'Bearer ' + apiKey }
        })
        const quotaData = await quotaResp.json()
        if (!quotaData.success) throw new Error(quotaData.error || 'Failed to check quota')
        const q = quotaData.data
        if (q.maxFileSize != null && file.size > q.maxFileSize) {
          throw new Error(`File too large (${fmtBytes(file.size)}), max ${fmtBytes(q.maxFileSize)}`)
        }
        if (q.remainingBytes != null && file.size > q.remainingBytes) {
          throw new Error(`Not enough storage (${fmtBytes(q.remainingBytes)} left), need ${fmtBytes(file.size)}`)
        }

        // Upload via FormData
        const formData = new FormData()
        formData.append('file', file)

        const resp = await fetch(serverUrl + '/api/user/upload', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + apiKey },
          body: formData
        })
        const data = await resp.json()
        if (!data.success) throw new Error(data.error || 'Upload failed')

        setAttachmentUrl(serverUrl + data.data.url)
        setAttachmentName(file.name)
        showToast('✓ ' + (data.data.url || 'Uploaded'), 'success')
      } catch (e: any) {
        showToast(`${T.error}: ${e.message || e}`, 'error')
      } finally {
        setUploading(false)
      }
    })

    fileInput.click()
  }

  // Check if client is online (last seen within 5 minutes)
  const isClientOnline = (c: Client): boolean => {
    if (!c.lastSeenAt) return false
    return Date.now() / 1000 - c.lastSeenAt < 5 * 60
  }

  // Get effective OS from client (prefer deviceOs over os)
  const getClientOs = (c: Client): string => (c.deviceOs || c.os || c.platform || '').toLowerCase()

  // Get OS icon component
  const getOsIconComponent = (c: Client) => {
    const os = getClientOs(c)
    if (os.includes('android')) return OsIcons.android
    if (os.includes('ios')) return OsIcons.ios
    if (os.includes('windows')) return OsIcons.windows
    if (os.includes('mac') || os.includes('darwin')) return OsIcons.macos
    if (os.includes('linux')) return OsIcons.linux
    return OsIcons.default
  }

  // OS display name
  const getOsDisplayName = (c: Client): string => {
    const os = getClientOs(c)
    if (os.includes('android')) return 'Android'
    if (os.includes('ios')) return 'iOS'
    if (os.includes('windows')) return 'Windows'
    if (os.includes('mac') || os.includes('darwin')) return 'macOS'
    if (os.includes('linux')) return 'Linux'
    return os
  }

  // Build client label: icon + name + (OS) + offline status
  const buildClientLabel = (c: Client) => {
    const name = c.deviceName || c.name || c.uuid.substring(0, 8)
    const osName = getOsDisplayName(c)
    const online = isClientOnline(c)
    const status = online ? '' : ' (离线)'
    return `${name}（${osName}）${status}`
  }

  return (
    <div className="compose-overlay open" id="composeOverlay" onClick={() => app.setComposeOpen(false)}>
      <div className="compose-modal" onClick={e => e.stopPropagation()}>
        <div className="compose-header">
          <h3>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
            <span id="t-compose-title">{T.composeTitle}</span>
          </h3>
          <button className="modal-close" id="composeCloseBtn" onClick={() => app.setComposeOpen(false)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div className="compose-body">
          <div className="compose-top-row">
            <div className="compose-field" style={{flexShrink:0}}>
              <label id="t-compose-channel">{T.composeChannel}</label>
              <div className="channel-badges" id="channelBadges">
                {(['push','email','sms'] as const).map(ch => {
                  const labels: Record<string, string> = { push: T.channelPush || 'Push', email: T.channelEmail || 'Email', sms: T.channelSms || 'SMS' }
                  return <span key={ch} className={`channel-badge ${channel === ch ? 'active' : ''} ${ch === 'sms' ? 'disabled' : ''}`} data-channel={ch} onClick={() => ch !== 'sms' && setChannel(ch)} style={ch === 'sms' ? {opacity: 0.5, cursor: 'not-allowed'} : undefined}>{labels[ch]}</span>
                })}
              </div>
            </div>
          </div>
          <div className="compose-field">
            <label id="t-compose-to">{T.composeTo}</label>
            {channel === 'push' ? (
              <div className="client-dropdown" ref={dropdownRef}>
                <div className="client-dropdown-trigger" onClick={() => setShowDropdown(!showDropdown)}>
                  <span className="client-dropdown-value">
                    {to === '*' ? (
                      <>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
                        <span>{T.broadcastAll.replace('{count}', clients.length.toString())}</span>
                      </>
                    ) : to ? (
                      <>
                        {(() => { const c = clients.find(cl => cl.uuid === to); return c ? getOsIconComponent(c) : null })()}
                        <span>{(() => { const c = clients.find(cl => cl.uuid === to); return c ? buildClientLabel(c) : to })()}</span>
                      </>
                    ) : (
                      <span className="client-dropdown-placeholder">{clients.length > 0 ? (T.selectDevice || 'Select a device') : (loadingClients ? 'Loading...' : T.noClients)}</span>
                    )}
                  </span>
                  <svg className="client-dropdown-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
                </div>
                {showDropdown && (
                  <div className="client-dropdown-menu">
                    <div className="client-dropdown-item" onClick={() => { setTo('*'); setShowDropdown(false) }}>
                      <span className="client-item-icon">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
                      </span>
                      <span className="client-item-name">{T.broadcastAll.replace('{count}', clients.length.toString())}</span>
                      <span className="client-item-status"></span>
                    </div>
                    {clients.map(c => {
                      const online = isClientOnline(c)
                      return (
                        <div key={c.uuid} className={`client-dropdown-item ${!online ? 'offline' : ''}`} onClick={() => { setTo(c.uuid); setShowDropdown(false) }}>
                          <span className="client-item-icon">{getOsIconComponent(c)}</span>
                          <span className="client-item-name">
                            {c.deviceName || c.name || c.uuid.substring(0, 8)}
                            {c.uuid === app.clientUuid && <span className="client-local-badge"> ({T.localDevice})</span>}
                          </span>
                          <span className="client-item-status">
                            {online ? (
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                            ) : (
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                            )}
                          </span>
                        </div>
                      )
                    })}
                    {clients.length === 0 && !loadingClients && (
                      <div className="client-dropdown-item disabled">
                        <span className="client-item-name">{T.noClients}</span>
                      </div>
                    )}
                    {loadingClients && (
                      <div className="client-dropdown-item disabled">
                        <span className="client-item-name">Loading...</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <input type="text" id="composeTo" placeholder={channel === 'email' ? 'recipient@example.com' : '+1234567890'} value={to} onChange={e => setTo(e.target.value)} />
            )}
          </div>
          {channel !== 'sms' && (
            <div className="compose-field">
              <label id="t-compose-subject">{T.composeSubject}</label>
              <input type="text" id="composeSubject" placeholder={T.composeSubjectHint} value={subject} onChange={e => setSubject(e.target.value)} />
            </div>
          )}
          <div className="compose-field">
            <label id="t-compose-body-label">{T.composeBody}</label>
            <textarea id="composeBody" placeholder={T.composeBodyHint} value={body} onChange={e => setBody(e.target.value)} />
          </div>
          {channel === 'push' && (
            <>
              <div className="compose-field">
                <label id="t-compose-attachment">{T.composeAttachment}</label>
                <div className="att-url-row">
                  <input type="text" id="composeAttachment" placeholder={T.composeAttHint} value={attachmentUrl} onChange={e => { setAttachmentUrl(e.target.value); setAttachmentName('') }} />
                  <button id="uploadAttBtn" className={`btn-icon-sm ${uploading ? 'uploading' : ''}`} title={T.composeUploadFile} onClick={handleUpload} disabled={uploading}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                  </button>
                </div>
                <div className="compose-hint">{T.composeAttHint}</div>
              </div>
              <div className="compose-advanced-toggle" id="composeAdvToggle" onClick={() => setShowAdvanced(!showAdvanced)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{transform: showAdvanced ? 'rotate(180deg)' : 'none', transition:'transform 0.2s'}}><polyline points="6 9 12 15 18 9"/></svg>
                <span id="t-compose-advanced">{T.composeAdvanced}</span>
              </div>
              {showAdvanced && (
                <div className="compose-advanced-body" id="composeAdvBody">
                  <div className="compose-row">
                    <div className="compose-field">
                      <label id="t-compose-priority">{T.composePriority}</label>
                      <input type="number" id="composePriority" min="0" max="99" value={priority} onChange={e => setPriority(e.target.value)} placeholder="0" />
                      <div className="compose-hint">{T.composePriHint}</div>
                    </div>
                    <div className="compose-field">
                      <label id="t-compose-format">{T.composeFormat}</label>
                      <select id="composeFormat" value={format} onChange={e => setFormat(e.target.value)}>
                        <option value="auto">{T.formatAuto || 'Auto'}</option>
                        <option value="text">{T.formatText || 'Text'}</option>
                        <option value="markdown">{T.formatMarkdown || 'MD'}</option>
                        <option value="html">{T.formatHtml || 'HTML'}</option>
                        <option value="json">{T.formatJson || 'JSON'}</option>
                      </select>
                    </div>
                  </div>
                  <div className="compose-field">
                    <label id="t-compose-url-label">{T.composeUrl}</label>
                    <input type="text" id="composeUrl" placeholder="https://example.com" value={url} onChange={e => setUrl(e.target.value)} />
                  </div>
                  <div className="compose-field">
                    <label id="t-compose-tags-label">{T.composeTags}</label>
                    <div className="compose-tags-input" id="composeTagsContainer">
                      {tags.map(tag => <span key={tag} className="compose-tag-chip" onClick={() => setTags(tags.filter(t => t !== tag))}>{tag} ✕</span>)}
                      <input type="text" id="composeTagsInput" placeholder={T.composeTagHint} value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={handleTagKeydown} />
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
        <div className="compose-footer">
          <div className="compose-status" id="composeStatus"></div>
          <button className="btn-cancel" id="composeCancelBtn" onClick={() => app.setComposeOpen(false)}>{T.cancel}</button>
          <button className="btn-save" id="composeSendBtn" onClick={handleSend} disabled={sending || (!body.trim() && !attachmentUrl)}>
            <span id="t-compose-send">{sending ? T.composeSending : T.composeSend}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
