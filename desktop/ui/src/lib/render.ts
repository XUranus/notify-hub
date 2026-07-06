export function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function relativeTime(dateStr: string, t: Record<string, string>): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return t.justNow || 'just now'
  if (mins < 60) return `${mins}${t.minAgo || 'min ago'}`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}${t.hrAgo || 'hr ago'}`
  return `${Math.floor(hrs / 24)}${t.daysAgo || 'days ago'}`
}

export function parseTags(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw
  if (typeof raw === 'string') { try { return JSON.parse(raw) } catch { return [] } }
  return []
}

export function renderMarkdown(md: string): string {
  let html = escapeHtml(md)
  // Code blocks
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="lang-$1">$2</code></pre>')
  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>')
  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  // Italic
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>')
  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
  // Headings
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>')
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>')
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>')
  // Line breaks
  html = html.replace(/\n/g, '<br>')
  return html
}

export function renderJsonSyntax(json: string): string {
  try {
    const obj = JSON.parse(json)
    json = JSON.stringify(obj, null, 2)
  } catch { /* keep as-is */ }
  return escapeHtml(json)
    .replace(/"([^"]+)"(?=\s*:)/g, '<span class="json-key">"$1"</span>')
    .replace(/:\s*"([^"]*?)"/g, ': <span class="json-string">"$1"</span>')
    .replace(/:\s*(true|false)/g, ': <span class="json-bool">$1</span>')
    .replace(/:\s*(\d+\.?\d*)/g, ': <span class="json-number">$1</span>')
    .replace(/:\s*(null)/g, ': <span class="json-null">$1</span>')
}

export function isHtmlContent(body: string): boolean {
  return /<[a-z][\s\S]*>/i.test(body)
}

export function sanitizeHtml(html: string): string {
  // Basic sanitizer: strip script/event handlers
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/on\w+="[^"]*"/gi, '')
    .replace(/on\w+='[^']*'/gi, '')
}

export function buildCurlExample(url: string, jwt: string, uuid: string): string {
  const apiKey = '__YOUR_API_KEY__'
  return `curl -X POST '${url}/api/v1/messages' \\
  -H 'Content-Type: application/json' \\
  -H 'Authorization: Bearer ${jwt || apiKey}' \\
  -d '{
    "channel": "push",
    "title": "Hello",
    "body": "Test message",
    "clientUuid": "${uuid}"
  }'`
}
