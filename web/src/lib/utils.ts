import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Convert a value to a Date, handling seconds-level unix timestamps. */
export function toDate(date: string | number | Date): Date {
  if (typeof date === 'number' && date < 1e12) {
    return new Date(date * 1000) // seconds → milliseconds
  }
  return new Date(date)
}

export function formatDate(date: string | number | Date): string {
  return toDate(date).toLocaleString()
}

export function formatRelativeTime(date: string | number | Date): string {
  const now = Date.now()
  const then = toDate(date).getTime()
  const diff = now - then

  if (diff < 60000) return 'just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return `${Math.floor(diff / 86400000)}d ago`
}

/** Copy text to clipboard. Works in both HTTPS and HTTP contexts. */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // Fall through to legacy method
  }
  // Fallback for non-secure contexts (HTTP)
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.left = '-9999px'
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
    return true
  } catch {
    return false
  }
}
