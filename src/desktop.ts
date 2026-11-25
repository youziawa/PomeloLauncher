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
  installed: boolean
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
export const openDataDir = () => invoke<void>('open_data_dir')

/* 窗口控制：桌面端调用原生窗口，浏览器端保持演示行为 */
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
