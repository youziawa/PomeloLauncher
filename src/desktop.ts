/* 桌面核心桥接：Tauri 2 存在时走 Rust 命令，浏览器内保持 mock 演示 */

export interface SystemInfo {
  app_version: string
  data_root: string
  platform: string
  desktop_core: boolean
}

export interface JavaInfo {
  path: string
  major: number
  full_version: string
}

export interface DesktopInstance {
  id: string
  name: string
  mc_version: string
  loader: string
  loader_version?: string
  created_at: string
  memory_mb: number
  java_path?: string
  installed: boolean
  last_played?: string
}

export interface DesktopAccount {
  name: string
  uuid: string
  kind: string
  access_token: string
  refresh_token?: string
}

export interface DesktopVersion {
  id: string
  kind: string
  release_time?: string
}

export interface InstallProgress {
  phase: 'resolve' | 'download' | 'done'
  current: number
  total: number
  message: string
}

export const isDesktop = () =>
  typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window)

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<T>(cmd, args)
}

export const getSystemInfo = () => invoke<SystemInfo>('system_info')
export const listJava = () => invoke<JavaInfo[]>('list_java')
export const listInstances = () => invoke<DesktopInstance[]>('list_instances')
export const listVersions = (limit = 30) => invoke<DesktopVersion[]>('list_versions', { limit })
export const createInstance = (name: string, version: string, loader: string) =>
  invoke<DesktopInstance>('create_instance', { name, version, loader })
export const updateInstance = (id: string, memoryMb?: number, javaPath?: string) =>
  invoke<DesktopInstance>('update_instance', { id, memoryMb, javaPath })
export const deleteInstance = (id: string) => invoke<void>('delete_instance', { id })
export const installInstance = (id: string, mirror: boolean) => invoke<void>('install_instance', { id, mirror })
export const installMod = (instanceId: string, slug: string, category: string) =>
  invoke<string>('install_mod', { instanceId, slug, category })
export const launchInstance = (id: string, accountUuid: string, memory: number) =>
  invoke<number>('launch_instance', { id, accountUuid, memory })
export const stopGame = () => invoke<void>('stop_game')
export const gameRunning = () => invoke<number | null>('game_running')
export const readLog = (id: string, maxLines = 400) => invoke<string>('read_log', { id, maxLines })
export const listAccounts = () => invoke<DesktopAccount[]>('list_accounts')
export const addOfflineAccount = (name: string) => invoke<DesktopAccount[]>('add_offline_account', { name })
export const removeAccount = (uuid: string) => invoke<DesktopAccount[]>('remove_account', { uuid })
export const saveAccount = (account: DesktopAccount) => invoke<DesktopAccount[]>('save_account', { account })
export const getMsClientId = () => invoke<string>('get_ms_client_id')
export const setMsClientId = (clientId: string) => invoke<void>('set_ms_client_id', { clientId })
export const exportHelpPack = (id: string) => invoke<string>('export_help_pack', { id })

export interface DeviceCode {
  device_code: string
  user_code: string
  verification_uri: string
  expires_in: number
  interval: number
}
export type DevicePoll =
  | { status: 'pending' }
  | { status: 'slow_down' }
  | { status: 'expired' }
  | { status: 'declined' }
  | { status: 'success'; name: string; uuid: string; access_token: string; refresh_token?: string }
  | { status: 'error'; message: string }
export const msDeviceCode = (clientId: string) => invoke<DeviceCode>('ms_device_code', { clientId })
export const msPoll = (clientId: string, deviceCode: string) => invoke<DevicePoll>('ms_poll', { clientId, deviceCode })
export const openDataDir = () => invoke<void>('open_data_dir')

/* 事件订阅（安装进度 / 游戏退出） */
export async function onInstallProgress(cb: (p: InstallProgress) => void): Promise<() => void> {
  const { listen } = await import('@tauri-apps/api/event')
  return listen<InstallProgress>('install-progress', e => cb(e.payload))
}
export async function onGameExit(cb: (code: unknown) => void): Promise<() => void> {
  const { listen } = await import('@tauri-apps/api/event')
  return listen('game-exit', e => cb(e.payload))
}

/* 窗口控制 */
export async function windowMinimize() {
  const { getCurrentWindow } = await import('@tauri-apps/api/window')
  await getCurrentWindow().minimize()
}
export async function windowClose() {
  const { getCurrentWindow } = await import('@tauri-apps/api/window')
  await getCurrentWindow().close()
}
export async function windowToggleMaximize() {
  const { getCurrentWindow } = await import('@tauri-apps/api/window')
  await getCurrentWindow().toggleMaximize()
}
export async function windowStartDragging() {
  const { getCurrentWindow } = await import('@tauri-apps/api/window')
  await getCurrentWindow().startDragging()
}
