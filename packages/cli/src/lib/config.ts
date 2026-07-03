import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { parse, stringify } from 'yaml'

const CONFIG_FILE = resolve(homedir(), '.notifyhub.yaml')

export interface CliConfig {
  server?: string
  token?: string
  format?: 'json' | 'table'
}

let _config: CliConfig | null = null

export function loadConfig(): CliConfig {
  if (_config) return _config

  if (existsSync(CONFIG_FILE)) {
    try {
      const content = readFileSync(CONFIG_FILE, 'utf-8')
      _config = parse(content) as CliConfig || {}
    } catch {
      _config = {}
    }
  } else {
    _config = {}
  }

  return _config
}

export function saveConfig(config: CliConfig) {
  _config = config
  writeFileSync(CONFIG_FILE, stringify(config), 'utf-8')
}

export function getConfigValue(key: keyof CliConfig): string | undefined {
  const config = loadConfig()
  return config[key] as string | undefined
}

export function setConfigValue(key: keyof CliConfig, value: string) {
  const config = loadConfig()
  ;(config as any)[key] = value
  saveConfig(config)
}
