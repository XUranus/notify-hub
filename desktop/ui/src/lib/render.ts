export function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function relativeTime(dateStr: string, t: Record<string, string>): string {
  const ts = new Date(dateStr).getTime()
  if (isNaN(ts)) return dateStr || ''
  const diff = Date.now() - ts
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
  // Code blocks (must be first to avoid inner processing)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_match, lang: string, code: string) => {
    const highlighted = highlightCode(code, lang)
    return `<pre><code class="lang-${lang}">${highlighted}</code></pre>`
  })
  // Tables
  html = html.replace(/(?:^|\n)((?:\|[^\n]+\|\n)+)/g, (_match, tableBlock: string) => {
    const lines = tableBlock.trim().split('\n')
    const rows: string[][] = []
    let sepIdx = -1
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      if (!line.startsWith('|')) continue
      const cells = line.split('|').slice(1, -1).map((c: string) => c.trim())
      if (sepIdx === -1 && cells.every((c: string) => /^:?-+:?$/.test(c))) {
        sepIdx = i
        continue
      }
      rows.push(cells)
    }
    if (rows.length === 0) return tableBlock
    let t = '<table>'
    // Header row
    t += '<tr>' + rows[0].map(c => `<th>${inlineFormat(c)}</th>`).join('') + '</tr>'
    // Data rows
    for (let i = 1; i < rows.length; i++) {
      t += '<tr>' + rows[i].map(c => `<td>${inlineFormat(c)}</td>`).join('') + '</tr>'
    }
    t += '</table>'
    return '\n' + t + '\n'
  })
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
  // Horizontal rule (---, ***, ___) — replace line and its trailing newline
  html = html.replace(/^(?:---+|\*\*\*+|___+)\s*$/gm, '<hr>')
  // Line breaks
  html = html.replace(/\n/g, '<br>')
  // Remove <br> immediately after <hr>
  html = html.replace(/<hr><br>/g, '<hr>')
  return html
}

// Basic syntax highlighting for code blocks
function highlightCode(code: string, lang: string): string {
  // Keywords per language family
  const keywords: Record<string, string[]> = {
    js: ['const','let','var','function','return','if','else','for','while','do','switch','case','break','continue','new','delete','typeof','instanceof','in','of','class','extends','super','this','import','export','from','default','async','await','try','catch','finally','throw','yield','static','get','set','true','false','null','undefined','void','with','debugger','interface','type','enum','implements','package','private','protected','public','abstract','as','constructor','declare','is','keyof','namespace','readonly','require','module','infer'],
    ts: ['const','let','var','function','return','if','else','for','while','do','switch','case','break','continue','new','delete','typeof','instanceof','in','of','class','extends','super','this','import','export','from','default','async','await','try','catch','finally','throw','yield','static','get','set','true','false','null','undefined','void','with','debugger','interface','type','enum','implements','package','private','protected','public','abstract','as','constructor','declare','is','keyof','namespace','readonly','require','module','infer'],
    py: ['def','class','return','if','elif','else','for','while','break','continue','pass','import','from','as','try','except','finally','raise','with','yield','lambda','and','or','not','in','is','True','False','None','global','nonlocal','assert','del','async','await','print','self','cls'],
    rs: ['fn','let','mut','const','pub','struct','enum','impl','trait','type','use','mod','crate','super','self','if','else','match','for','while','loop','break','continue','return','move','ref','async','await','dyn','where','as','in','true','false','unsafe','extern','static','box','abstract','become','do','final','macro','override','priv','typeof','unsized','virtual','try'],
    go: ['func','var','const','type','struct','interface','map','chan','package','import','return','if','else','for','range','switch','case','default','break','continue','go','defer','select','fallthrough','goto','nil','true','false','iota','make','new','len','cap','append','copy','delete','close','complex','real','imag','panic','recover','print','println','error','string','int','int8','int16','int32','int64','uint','uint8','uint16','uint32','uint64','float32','float64','complex64','complex128','bool','byte','rune'],
    java: ['abstract','assert','boolean','break','byte','case','catch','char','class','continue','default','do','double','else','enum','extends','final','finally','float','for','if','implements','import','instanceof','int','interface','long','native','new','package','private','protected','public','return','short','static','strictfp','super','switch','synchronized','this','throw','throws','transient','try','void','volatile','while','true','false','null'],
    rb: ['def','end','class','module','if','elsif','else','unless','while','until','for','in','do','return','yield','break','next','redo','retry','begin','rescue','ensure','raise','and','or','not','true','false','nil','self','super','require','include','extend','attr_accessor','attr_reader','attr_writer','puts','print','lambda','proc','block_given?'],
    sh: ['if','then','else','elif','fi','for','while','do','done','case','esac','in','function','return','exit','export','source','local','readonly','declare','typeset','unset','shift','set','unset','alias','unalias','echo','printf','read','test','true','false'],
    sql: ['SELECT','FROM','WHERE','INSERT','INTO','VALUES','UPDATE','SET','DELETE','CREATE','TABLE','ALTER','DROP','INDEX','JOIN','LEFT','RIGHT','INNER','OUTER','ON','AND','OR','NOT','IN','LIKE','BETWEEN','IS','NULL','AS','ORDER','BY','GROUP','HAVING','LIMIT','OFFSET','UNION','ALL','DISTINCT','COUNT','SUM','AVG','MIN','MAX','EXISTS','CASE','WHEN','THEN','ELSE','END','PRIMARY','KEY','FOREIGN','REFERENCES','CONSTRAINT','DEFAULT','AUTO_INCREMENT','VARCHAR','INT','INTEGER','TEXT','BOOLEAN','DATE','TIMESTAMP','DESC','ASC','TRUE','FALSE'],
    json: [],
    html: [],
    css: [],
    bash: ['if','then','else','elif','fi','for','while','do','done','case','esac','in','function','return','exit','export','source','local','readonly','declare','typeset','unset','shift','set','unset','alias','unalias','echo','printf','read','test','true','false'],
  }
  // Map common aliases
  const aliasMap: Record<string, string> = { javascript: 'js', typescript: 'ts', python: 'py', rust: 'rs', golang: 'go', ruby: 'rb', shell: 'sh', zsh: 'sh', powershell: 'sh', ps1: 'sh', yml: 'yaml', md: 'markdown' }
  const key = aliasMap[lang] || lang
  const kwList = keywords[key] || keywords['js'] || []

  let result = code
  // Strings (double and single quoted)
  result = result.replace(/(["'])(?:(?!\1|\\).|\\.)*\1/g, '<span class="hl-string">$&</span>')
  // Template literals
  result = result.replace(/`(?:[^`\\]|\\.)*`/g, '<span class="hl-string">$&</span>')
  // Comments (line)
  result = result.replace(/(\/\/.*)/g, '<span class="hl-comment">$1</span>')
  result = result.replace(/(#.*)/g, '<span class="hl-comment">$1</span>')
  // Comments (block)
  result = result.replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="hl-comment">$1</span>')
  // Numbers
  result = result.replace(/\b(\d+\.?\d*(?:e[+-]?\d+)?)\b/gi, '<span class="hl-number">$1</span>')
  // Keywords
  if (kwList.length > 0) {
    const kwRegex = new RegExp('\\b(' + kwList.join('|') + ')\\b', 'g')
    result = result.replace(kwRegex, '<span class="hl-keyword">$1</span>')
  }
  // Function calls
  result = result.replace(/\b([a-zA-Z_]\w*)\s*(?=\()/g, '<span class="hl-func">$1</span>')
  return result
}

// Apply inline formatting (bold, italic, code) to table cell content
function inlineFormat(s: string): string {
  return s
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
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
