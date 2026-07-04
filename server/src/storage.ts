import { mkdir, unlink, writeFile } from 'node:fs/promises'
import { access } from 'node:fs'
import { join, extname } from 'node:path'
import { randomUUID } from 'node:crypto'

const UPLOAD_DIR = join(process.cwd(), 'data', 'uploads')

/** Blocked MIME types — executable/script types that should never be uploaded */
const BLOCKED_MIME_TYPES = new Set([
  'application/x-executable',
  'application/x-msdos-program',
  'application/x-msdownload',
  'application/x-sh',
  'application/x-csh',
  'application/x-bat',
  'application/x-shellscript',
  'application/javascript',
  'text/javascript',
  'application/x-httpd-php',
  'application/x-perl',
  'application/x-python',
  'application/x-ruby',
])

/** Blocked file extensions */
const BLOCKED_EXTENSIONS = new Set([
  '.exe', '.bat', '.cmd', '.com', '.msi', '.scr',
  '.sh', '.bash', '.csh', '.ksh',
  '.js', '.mjs',
  '.php', '.phtml',
  '.py', '.pyc',
  '.rb',
  '.pl', '.pm',
  '.dll', '.so', '.dylib',
  '.app', '.deb', '.rpm',
  '.jar', '.war',
])

/** Ensure upload directory exists */
export async function ensureUploadDir() {
  await mkdir(UPLOAD_DIR, { recursive: true })
}

/** Get the absolute path for an uploaded file */
export function getUploadPath(filename: string): string {
  return join(UPLOAD_DIR, filename)
}

/** Validate file MIME type and extension. Returns error message or null if valid. */
export function validateFileType(originalName: string, mimeType: string): string | null {
  const ext = extname(originalName).toLowerCase()

  if (BLOCKED_EXTENSIONS.has(ext)) {
    return `File type '${ext}' is not allowed`
  }

  if (mimeType && BLOCKED_MIME_TYPES.has(mimeType.toLowerCase())) {
    return `MIME type '${mimeType}' is not allowed`
  }

  return null
}

/** Save a file buffer to disk, return the generated filename */
export async function saveFile(buffer: Buffer, originalName: string): Promise<string> {
  await ensureUploadDir()
  const ext = extname(originalName) || ''
  const filename = `${randomUUID()}${ext}`
  const filePath = join(UPLOAD_DIR, filename)
  await writeFile(filePath, buffer)
  return filename
}

/** Delete a file from disk (no-op if missing) */
export async function deleteFile(filename: string): Promise<void> {
  const filePath = join(UPLOAD_DIR, filename)
  try {
    await unlink(filePath)
  } catch {
    // ignore (file not found)
  }
}

/** URL path for serving */
export function getFileUrl(filename: string): string {
  return `/uploads/${filename}`
}
