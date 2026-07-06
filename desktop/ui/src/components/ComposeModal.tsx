import { useState, useEffect, useCallback } from 'react'

interface Props { app: any }

interface Client { uuid: string; name: string | null; os: string | null; arch: string | null; appVersion: string | null; platform: string | null }

function fmtBytes(bytes: number): string {
  if (bytes < 1024) return bytes + 'B'
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + 'KB'
  return (bytes / 1048576).toFixed(1) + 'MB'
}

export function ComposeModal({ app }: Props) {
  const { T, showToast, invoke } = app
  const [channel, setChannel] = useState('push')
  const [format, setFormat] = useState('text')
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

  // Load clients when channel is 'push'
  const loadClients = useCallback(async () => {
    setLoadingClients(true)
    try {
      const data = await invoke('get_clients')
      setClients(data || [])
    } catch { setClients([]) }
    finally { setLoadingClients(false) }
  }, [invoke])

  useEffect(() => {
    if (app.composeOpen && channel === 'push') loadClients()
  }, [app.composeOpen, channel, loadClients])

  if (!app.composeOpen) return null

  const handleSend = async () => {
    const toValue = channel === 'push' ? (document.getElementById('composeToSelect') as HTMLSelectElement)?.value || to : to
    if (!toValue) { showToast(`${T.composeTo} is required`, 'error'); return }
    if (!subject.trim() && !body.trim()) { showToast(`${T.composeSubject} / ${T.composeBody} required`, 'error'); return }

    setSending(true)
    try {
      const args: any = {
        channel,
        to: toValue,
        subject: subject.trim() || null,
        body: body.trim() || null,
        tags: tags.length > 0 ? tags : null,
        priority: parseInt(priority) > 0 ? parseInt(priority) : null,
        url: url.trim() || null,
        format: format !== 'text' ? format : null,
      }
      if (attachmentUrl) {
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
        const quotaResp = await fetch(serverUrl + '/api/v1/upload/quota', {
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

        const resp = await fetch(serverUrl + '/api/v1/upload', {
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

  // Build client label with OS icon + device info
  const buildClientLabel = (c: Client) => {
    const name = c.name || c.uuid.substring(0, 8)
    const os = c.os || c.platform || ''
    const arch = c.arch || ''
    const ver = c.appVersion || ''
    const meta = [os, arch, ver].filter(Boolean).join(', ')
    return meta ? `${name} (${meta})` : name
  }

  // OS icon for client
  const getOsIcon = (c: Client): string => {
    const os = (c.os || c.platform || '').toLowerCase()
    if (os.includes('android')) return '🤖'
    if (os.includes('ios')) return '🍎'
    if (os.includes('windows')) return '🪟'
    if (os.includes('mac') || os.includes('darwin')) return '🍎'
    if (os.includes('linux')) return '🐧'
    return '💻'
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
                {['push','email','sms'].map(ch => <span key={ch} className={`channel-badge ${channel === ch ? 'active' : ''}`} data-channel={ch} onClick={() => setChannel(ch)}>{ch.charAt(0).toUpperCase() + ch.slice(1)}</span>)}
              </div>
            </div>
            <div className="compose-field" style={{width:'90px',flexShrink:0}}>
              <label id="t-compose-format">{T.composeFormat}</label>
              <select id="composeFormat" value={format} onChange={e => setFormat(e.target.value)}>
                <option value="text">Text</option><option value="markdown">MD</option><option value="html">HTML</option><option value="json">JSON</option>
              </select>
            </div>
            <div className="compose-field" style={{flex:1,minWidth:0}}>
              <label id="t-compose-to">{T.composeTo}</label>
              {channel === 'push' ? (
                <select id="composeToSelect" value={to} onChange={e => setTo(e.target.value)}>
                  <option value="*">📢 {T.broadcastAll}</option>
                  {clients.map(c => <option key={c.uuid} value={c.uuid}>{getOsIcon(c)} {buildClientLabel(c)}</option>)}
                  {clients.length === 0 && !loadingClients && <option value="" disabled>{T.noClients}</option>}
                  {loadingClients && <option value="" disabled>Loading...</option>}
                </select>
              ) : (
                <input type="text" id="composeTo" placeholder={channel === 'email' ? 'recipient@example.com' : '+1234567890'} value={to} onChange={e => setTo(e.target.value)} />
              )}
            </div>
          </div>
          <div className="compose-field">
            <label id="t-compose-subject">{T.composeSubject}</label>
            <input type="text" id="composeSubject" placeholder={T.composeSubjectHint} value={subject} onChange={e => setSubject(e.target.value)} />
          </div>
          <div className="compose-field">
            <label id="t-compose-body-label">{T.composeBody}</label>
            <textarea id="composeBody" placeholder={T.composeBodyHint} value={body} onChange={e => setBody(e.target.value)} />
          </div>
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
                  <label id="t-compose-url-label">{T.composeUrl}</label>
                  <input type="text" id="composeUrl" placeholder="https://example.com" value={url} onChange={e => setUrl(e.target.value)} />
                </div>
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
        </div>
        <div className="compose-footer">
          <div className="compose-status" id="composeStatus"></div>
          <button className="btn-cancel" id="composeCancelBtn" onClick={() => app.setComposeOpen(false)}>{T.cancel}</button>
          <button className="btn-save" id="composeSendBtn" onClick={handleSend} disabled={sending || !body.trim()}>
            <span id="t-compose-send">{sending ? T.composeSending : T.composeSend}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
