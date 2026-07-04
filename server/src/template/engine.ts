/**
 * Simple template engine using {{variable}} syntax.
 * Supports: {{varName}}, {{varName | default:"fallback"}}
 */

const VAR_PATTERN = /\{\{\s*(\w+)(?:\s*\|\s*default:"([^"]*)")?\s*\}\}/g

export function renderTemplate(
  template: string,
  variables: Record<string, string>
): string {
  return template.replace(VAR_PATTERN, (_, key: string, defaultVal?: string) => {
    const value = variables[key]
    if (value !== undefined && value !== null) return value
    if (defaultVal !== undefined) return defaultVal
    return `{{${key}}}` // keep original if not found
  })
}

/**
 * Extract variable names from a template string.
 */
export function extractVariables(template: string): string[] {
  const vars: string[] = []
  const pattern = /\{\{\s*(\w+)/g
  let match
  while ((match = pattern.exec(template)) !== null) {
    if (!vars.includes(match[1])) {
      vars.push(match[1])
    }
  }
  return vars
}
