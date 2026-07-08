import { invoke as tauriInvoke } from '@tauri-apps/api/core'

export const invoke = tauriInvoke

// ── Config ──

export interface ServerConfig {
  url: string
  username: string
  password: string
  jwt: string
}

export interface ClientConfig {
  uuid: string
  name: string
}

export interface AppConfig {
  server: ServerConfig
  client: ClientConfig
  autostart: boolean
  auto_download_images: boolean
  connection_mode: string
}

export interface PollStateSnapshot {
  running: boolean
  mode: string
  last_poll: string | null
  error: string | null
}

export interface SystemInfo {
  os: string
  arch: string
  desktop_env: string
}

export interface AppInfo {
  version: string
  config_path: string
  messages_path: string
}

export interface Message {
  id: string
  title: string
  body: string
  level: string
  read: boolean
  flagged: boolean
  tags: string[] | null
  channel: string | null
  topicId: string | null
  topicTitle: string | null
  url: string | null
  attachment: string | null
  format: string | null
  priority: string | null
  createdAt: string
  clientUuid: string | null
}

export interface Client {
  uuid: string
  name: string
  os: string
  arch: string
  desktop: string
  appVersion: string
  connectionMode: string | null
  lastSeenAt: string | null
}

// ── API wrappers ──

export const api = {
  getConfig: () => invoke<AppConfig>('get_config'),
  saveConfig: (cfg: AppConfig) => invoke('save_config', { cfg }),
  reconnect: () => invoke('reconnect'),
  logout: () => invoke('logout'),

  getMessages: () => invoke<Message[]>('get_messages'),
  markAsRead: (id: string) => invoke('mark_as_read', { id }),
  toggleFlag: (id: string) => invoke('toggle_flag', { id }),
  deleteMessageUndo: (id: string) => invoke('delete_message_undo', { id }),
  insertMessage: (msg: Message, index: number) => invoke('insert_message', { msg, index }),
  deleteMessage: (id: string) => invoke('delete_message', { id }),
  clearMessages: () => invoke('clear_messages'),

  getPollState: () => invoke<PollStateSnapshot>('get_poll_state'),
  getSystemInfo: () => invoke<SystemInfo>('get_system_info'),
  getAppInfo: () => invoke<AppInfo>('get_app_info'),
  getSystemFonts: () => invoke<string[]>('get_system_fonts'),
  getClients: () => invoke<Client[]>('get_clients'),
  updateClientName: (name: string) => invoke('update_client_name', { name }),

  getAutostart: () => invoke<boolean>('get_autostart'),
  setAutostart: (enabled: boolean) => invoke('set_autostart', { enabled }),
  getConnectionMode: () => invoke<string>('get_connection_mode'),
  setConnectionMode: (mode: string) => invoke('set_connection_mode', { mode }),

  backupMessagesJson: () => invoke<string>('backup_messages_json'),
  restoreMessagesJson: (json: string) => invoke<number>('restore_messages_json', { json }),
  exportMessagesCsv: () => invoke<string>('export_messages_csv'),
  exportMessagesXml: () => invoke<string>('export_messages_xml'),
  exportMessagesJson: () => invoke<string>('export_messages_json'),

  sendMessage: (msg: Record<string, unknown>) => invoke('send_message', { msg }),
  downloadFile: (url: string, filename: string) => invoke('download_file', { url, filename }),
  readImageDataUrl: (path: string) => invoke<string>('read_image_data_url', { path }),
  fetchImageDataUrl: (url: string) => invoke<string>('fetch_image_data_url', { url }),

  // Window
  windowMinimize: () => invoke('window_minimize'),
  windowToggleMaximize: () => invoke('window_toggle_maximize'),
  windowClose: () => invoke('window_close'),
}
