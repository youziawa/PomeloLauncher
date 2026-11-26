/* PomeloLauncher — 全局状态：浏览器演示（mock）与桌面真实核心（Tauri IPC）双模式 */
import React, { createContext, useContext, useEffect, useReducer, useState, useCallback } from 'react'
import {
  Instance, Account, Mod, PackItem, Server, Save, ResourceItem, DownloadTask, LogLine, IconKind,
  initialInstances, initialAccounts, initialMods, initialPacks, initialServers, initialSaves,
  initialDownloads, PREFLIGHT_CHECKS, LAUNCH_MILESTONES, AMBIENT_LOGS, CRASH_LINES, CRASH_INFO,
  uid, nowTime, TagColor, LoaderType,
} from './mock'
import {
  isDesktop, getSystemInfo, listInstances as listDesktopInstances, listAccounts as listDesktopAccounts,
  addOfflineAccount, removeAccount as removeDesktopAccount, installInstance as installDesktopInstance,
  installMod as installDesktopMod, readLog as readDesktopLog, exportHelpPack,
  launchInstance as launchDesktopInstance, stopGame as stopDesktopGame, onInstallProgress, onGameExit,
  updateInstance as updateDesktopInstance, listVersions,
  createInstance as createDesktopInstance,
  DesktopInstance, DesktopAccount,
} from './desktop'

export type Page = 'home' | 'instances' | 'resources' | 'downloads' | 'accounts' | 'settings'

export interface Settings {
  theme: 'light' | 'dark' | 'system'
  accent: string
  wallpaper: boolean
  motion: boolean
  fontScale: number
  visibility: string
  memory: number
  preflight: boolean
  source: string
  concurrency: number
  proxy: string
  telemetry: boolean
  redact: boolean
}

const defaultSettings: Settings = {
  theme: 'light', accent: 'green', wallpaper: false, motion: true, fontScale: 100,
  visibility: 'hide', memory: 4096, preflight: true,
  source: 'bmclapi', concurrency: 8, proxy: 'system',
  telemetry: false, redact: true,
}

export interface Toast { id: string; text: string; kind: 'success' | 'info' | 'warning' | 'danger' }
export type ModalState =
  | null
  | { type: 'add-account' }
  | { type: 'install'; res: ResourceItem }
  | { type: 'new-instance' }
  | { type: 'crash' }

export type LaunchPhase = 'idle' | 'preflight' | 'launching' | 'running' | 'crashed'
export interface LaunchState {
  phase: LaunchPhase
  instanceId: string | null
  crashDemo: boolean
  phaseStart: number
  checksDone: number
  progress: number
  milestone: number
  logs: LogLine[]
  runStart: number
  lastAmbient: number
}
interface SimState { launch: LaunchState; downloads: DownloadTask[] }

const idleLaunch: LaunchState = {
  phase: 'idle', instanceId: null, crashDemo: false, phaseStart: 0, checksDone: 0,
  progress: 0, milestone: 0, logs: [], runStart: 0, lastAmbient: 0,
}

type SimAction =
  | { type: 'tick'; now: number }
  | { type: 'start'; instanceId: string; crashDemo: boolean; now: number }
  | { type: 'stop' }
  | { type: 'dismiss-crash' }
  | { type: 'add-task'; task: DownloadTask }
  | { type: 'dl-op'; id: string; op: 'pause' | 'resume' | 'cancel' | 'retry' }
  | { type: 'pause-all' } | { type: 'resume-all' } | { type: 'clear-done' }

function simReducer(s: SimState, a: SimAction): SimState {
  switch (a.type) {
    case 'start':
      return { ...s, launch: { ...idleLaunch, phase: 'preflight', instanceId: a.instanceId, crashDemo: a.crashDemo, phaseStart: a.now, logs: [{ t: nowTime(), level: 'INFO', text: '开始启动前检查（Pre-flight）…' }] } }
    case 'stop':
    case 'dismiss-crash':
      return { ...s, launch: idleLaunch }
    case 'add-task':
      return { ...s, downloads: [a.task, ...s.downloads] }
    case 'dl-op': {
      const downloads = s.downloads
        .map(d => {
          if (d.id !== a.id) return d
          if (a.op === 'pause') return { ...d, status: 'paused' as const, speedMBs: 0 }
          if (a.op === 'resume') return { ...d, status: 'downloading' as const, speedMBs: 6 + Math.random() * 10 }
          if (a.op === 'retry') return { ...d, status: 'downloading' as const, progress: 0, speedMBs: 6 + Math.random() * 10, error: undefined }
          return d
        })
        .filter(d => !(a.op === 'cancel' && d.id === a.id))
      return { ...s, downloads }
    }
    case 'pause-all':
      return { ...s, downloads: s.downloads.map(d => d.status === 'downloading' ? { ...d, status: 'paused', speedMBs: 0 } : d) }
    case 'resume-all':
      return { ...s, downloads: s.downloads.map(d => d.status === 'paused' ? { ...d, status: 'downloading', speedMBs: 6 + Math.random() * 10 } : d) }
    case 'clear-done':
      return { ...s, downloads: s.downloads.filter(d => d.status !== 'done') }
    case 'tick': {
      const now = a.now
      let downloads = s.downloads
      const active = downloads.some(d => d.status === 'downloading')
      if (active) {
        downloads = downloads.map(d => {
          if (d.status !== 'downloading') return d
          const speed = Math.max(1.5, d.speedMBs + (Math.random() - 0.5) * 3)
          const progress = d.progress + (speed / d.sizeMB) * 100 * 0.5
          if (progress >= 100) return { ...d, progress: 100, speedMBs: 0, status: 'done' as const }
          return { ...d, progress, speedMBs: speed }
        })
      }
      const L = s.launch
      if (L.phase === 'idle' || L.phase === 'crashed') {
        return downloads === s.downloads ? s : { ...s, downloads }
      }
      let launch = { ...L, logs: L.logs }
      const push = (level: LogLine['level'], text: string) => {
        launch.logs = [...launch.logs.slice(-199), { t: nowTime(), level, text }]
      }
      if (L.phase === 'preflight') {
        const done = Math.min(PREFLIGHT_CHECKS.length, Math.floor((now - L.phaseStart) / 550))
        launch.checksDone = done
        if (done >= PREFLIGHT_CHECKS.length) {
          launch.phase = 'launching'; launch.phaseStart = now; launch.progress = 0; launch.milestone = 0
          push('INFO', '启动前检查全部通过 ✓')
        }
      } else if (L.phase === 'launching') {
        launch.progress = Math.min(100, (now - L.phaseStart) / 42)
        while (launch.milestone < LAUNCH_MILESTONES.length && launch.progress >= LAUNCH_MILESTONES[launch.milestone].at) {
          push('INFO', LAUNCH_MILESTONES[launch.milestone].line)
          launch.milestone++
        }
        if (launch.progress >= 100) {
          launch.phase = 'running'; launch.runStart = now; launch.lastAmbient = now
          push('INFO', '游戏窗口已创建，启动器按策略隐藏到托盘（DEMO 中保持可见）')
        }
      } else if (L.phase === 'running') {
        if (now - L.lastAmbient > 2200) {
          launch.lastAmbient = now
          push('INFO', AMBIENT_LOGS[launch.logs.length % AMBIENT_LOGS.length])
        }
        if (L.crashDemo && now - L.runStart > 3800) {
          launch.phase = 'crashed'
          launch.logs = [...launch.logs, ...CRASH_LINES.map(l => ({ ...l, t: nowTime() }))]
        }
      }
      return { launch, downloads }
    }
    default:
      return s
  }
}

interface Ctx {
  page: Page; go: (p: Page) => void
  detailId: string | null; openDetail: (id: string | null) => void
  instances: Instance[]
  currentId: string; setCurrentId: (id: string) => void
  accounts: Account[]; currentAccId: string; setCurrentAccId: (id: string) => void
  addAccount: (a: Account) => void; removeAccount: (id: string) => void
  mods: Record<string, Mod[]>
  toggleMod: (instId: string, modId: string) => void
  setAllMods: (instId: string, enabled: boolean) => void
  updateMod: (instId: string, modId: string) => void
  checkUpdates: (instId: string) => void
  packs: Record<string, { resourcepacks: PackItem[]; shaders: PackItem[] }>
  togglePack: (instId: string, kind: 'resourcepacks' | 'shaders', id: string) => void
  movePack: (instId: string, kind: 'resourcepacks' | 'shaders', id: string, dir: -1 | 1) => void
  servers: Record<string, Server[]>
  addServer: (instId: string, name: string, address: string) => void
  removeServer: (instId: string, id: string) => void
  saves: Record<string, Save[]>
  downloads: DownloadTask[]
  dlOp: (id: string, op: 'pause' | 'resume' | 'cancel' | 'retry') => void
  pauseAll: () => void; resumeAll: () => void; clearDone: () => void
  addTask: (name: string, kind: DownloadTask['kind'], sizeMB: number, source?: DownloadTask['source']) => void
  launch: LaunchState
  startLaunch: (id?: string) => void; stopLaunch: () => void
  fixAndRelaunch: () => void; exportHelp: () => void
  crashReport: CrashReport | null
  refreshAccounts: () => void
  settings: Settings; setSettings: (patch: Partial<Settings>) => void
  toasts: Toast[]; toast: (text: string, kind?: Toast['kind']) => void
  modal: ModalState; openModal: (m: ModalState) => void; closeModal: () => void
  wizardOpen: boolean; closeWizard: () => void; openWizard: () => void
  installedIds: string[]
  installResource: (res: ResourceItem, withDeps: boolean, targetId?: string) => void
  createInstance: (name: string, ver: string, loader: LoaderType) => void
  installGame: (id: string) => void
  toggleFavorite: (id: string) => void
  updateInstance: (id: string, patch: Partial<Instance>) => void
  logsFor: (instId: string) => LogLine[]
  desktop: boolean
  versionOptions: string[]
  dLaunch: { instanceId: string | null; pid: number | null; startedAt: number }
}

const AppCtx = createContext<Ctx>(null as unknown as Ctx)
export const useApp = () => useContext(AppCtx)

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem('pomelo-demo-settings')
    if (raw) return { ...defaultSettings, ...JSON.parse(raw) }
  } catch { /* 忽略 */ }
  return defaultSettings
}

const DESKTOP_TAGS: TagColor[] = ['green', 'blue', 'yellow', 'pink', 'purple', 'teal']

function mapDesktopInstance(d: DesktopInstance, index: number): Instance {
  const loaderMap: Record<string, LoaderType> = {
    vanilla: 'Vanilla', fabric: 'Fabric', forge: 'Forge', neoforge: 'NeoForge', quilt: 'Quilt',
  }
  const icon: IconKind =
    d.loader === 'forge' || d.loader === 'neoforge' ? 'gear'
      : d.loader === 'fabric' || d.loader === 'quilt' ? 'grass'
        : 'island'
  return {
    id: d.id,
    name: d.name,
    mcVersion: d.mc_version,
    loader: loaderMap[d.loader] ?? 'Vanilla',
    loaderVersion: d.loader_version,
    icon,
    tag: DESKTOP_TAGS[index % DESKTOP_TAGS.length],
    favorite: false,
    lastPlayed: d.last_played ?? '从未',
    playTime: '—',
    modsCount: 0,
    memoryMB: d.memory_mb,
    java: 'Java（自动匹配）',
    isolation: true,
    installed: d.installed,
  }
}

function mapDesktopAccount(a: DesktopAccount): Account {
  return {
    id: a.uuid,
    name: a.name,
    kind: a.kind === 'microsoft' ? 'microsoft' : a.kind === 'authlib' ? 'authlib' : 'offline',
    server: a.kind === 'authlib' ? '皮肤站' : undefined,
    skin: a.kind === 'offline' ? 'pomelo' : 'steve',
  }
}

export interface CrashReport {
  code: number
  log: string
  title: string
  cause: string
  suggestion: string
}

/* 轻量崩溃规则引擎（M1）：按日志特征给出人话诊断 */
export function diagnoseLog(log: string): { title: string; cause: string; suggestion: string } {
  if (/UnsupportedClassVersionError|requires Java|需要 Java|java 的 \d+ 及以上|Unrecognized option|Could not create the Java Virtual Machine/.test(log)) {
    return {
      title: 'Java 版本不匹配',
      cause: '游戏或模组要求的 Java 版本高于当前启动所用版本。',
      suggestion: '安装对应版本的 Java（如 26.x 需要 Java 25），或在实例设置中指定 Java 路径后重试。',
    }
  }
  if (/Incompatible mods|Mod resolution failed|Missing or unsupported mandatory dependencies/.test(log)) {
    return {
      title: '模组依赖冲突',
      cause: 'Fabric/Forge 解析模组依赖失败：缺少前置、版本不兼容或模组互相冲突。',
      suggestion: '按日志中的 Fix 提示补齐/更换模组版本，或暂时移除最近安装的模组后重试。',
    }
  }
  if (/OutOfMemoryError/.test(log)) {
    return {
      title: '内存不足',
      cause: 'JVM 堆内存耗尽（-Xmx 过小或模组/光影占用过高）。',
      suggestion: '在实例设置中提高内存分配，或关闭部分光影/大型模组后重试。',
    }
  }
  if (/Mixin apply|MixinApplyError|InjectionError/.test(log)) {
    return {
      title: '模组 Mixin 冲突',
      cause: '两个模组同时修改了同一处游戏代码，注入失败。',
      suggestion: '更新冲突模组到兼容版本，或禁用其中之一后重试。',
    }
  }
  return {
    title: '游戏崩溃',
    cause: '进程以非零退出码结束，日志中未命中已知规则。',
    suggestion: '导出求助包（已脱敏）发到社区或交给 AI 分析；也可查看完整日志定位。',
  }
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [page, setPage] = useState<Page>('home')
  const [detailId, setDetailId] = useState<string | null>(null)
  const [instances, setInstances] = useState<Instance[]>(initialInstances)
  const [currentId, setCurrentId] = useState('i1')
  const [accounts, setAccounts] = useState<Account[]>(initialAccounts)
  const [currentAccId, setCurrentAccId] = useState('a1')
  const [mods, setMods] = useState<Record<string, Mod[]>>(initialMods)
  const [packs, setPacks] = useState(initialPacks)
  const [servers, setServers] = useState(initialServers)
  const [saves] = useState(initialSaves)
  const [settings, setSettingsState] = useState<Settings>(loadSettings)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [modal, setModal] = useState<ModalState>(null)
  const [wizardOpen, setWizardOpen] = useState(() => !isDesktop() && localStorage.getItem('pomelo-demo-wizard') !== 'done')
  const [installedIds, setInstalledIds] = useState<string[]>([])
  const [sim, dispatch] = useReducer(simReducer, { launch: idleLaunch, downloads: initialDownloads })

  /* 桌面模式 */
  const desktopEnv = isDesktop()
  const [desktop, setDesktop] = useState(false)
  const [versionOptions, setVersionOptions] = useState<string[]>([])
  const [realTasks, setRealTasks] = useState<DownloadTask[]>([])
  const [dLaunch, setDLaunch] = useState<{ instanceId: string | null; pid: number | null; startedAt: number }>({
    instanceId: null, pid: null, startedAt: 0,
  })
  const [crashReport, setCrashReport] = useState<CrashReport | null>(null)
  const dLaunchRef = React.useRef(dLaunch)
  dLaunchRef.current = dLaunch
  const desktopRef = React.useRef(desktop)
  desktopRef.current = desktop

  /* 模拟时钟 */
  useEffect(() => {
    const t = setInterval(() => dispatch({ type: 'tick', now: Date.now() }), 500)
    return () => clearInterval(t)
  }, [])

  /* 设置应用到文档 */
  useEffect(() => {
    const root = document.documentElement
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const theme = settings.theme === 'system' ? (mq.matches ? 'dark' : 'light') : settings.theme
      root.dataset.theme = theme
      root.dataset.accent = settings.accent
      root.dataset.motion = settings.motion ? 'on' : 'off'
      root.style.fontSize = `${14 * settings.fontScale / 100}px`
    }
    apply()
    mq.addEventListener('change', apply)
    localStorage.setItem('pomelo-demo-settings', JSON.stringify(settings))
    return () => mq.removeEventListener('change', apply)
  }, [settings])

  const toast = useCallback((text: string, kind: Toast['kind'] = 'info') => {
    const id = uid('t')
    setToasts(ts => [...ts.slice(-3), { id, text, kind }])
    setTimeout(() => setToasts(ts => ts.filter(t => t.id !== id)), 4200)
  }, [])

  /* 桌面核心：加载真实实例/账户/版本列表 */
  useEffect(() => {
    if (!desktopEnv) return
    let alive = true
    getSystemInfo()
      .then(() => { if (alive) setDesktop(true) })
      .catch(e => console.warn('desktop core unavailable', e))
    listDesktopInstances()
      .then(list => {
        if (!alive) return
        const mapped = list.map(mapDesktopInstance)
        setInstances(mapped)
        if (mapped.length > 0) {
          setCurrentId(prev => (mapped.some(i => i.id === prev) ? prev : mapped[0].id))
        }
      })
      .catch(e => console.warn('list_instances failed', e))
    listDesktopAccounts()
      .then(accs => {
        if (!alive) return
        const mapped = accs.map(mapDesktopAccount)
        setAccounts(mapped)
        if (mapped.length > 0) setCurrentAccId(mapped[0].id)
      })
      .catch(e => console.warn('list_accounts failed', e))
    listVersions(40)
      .then(v => { if (alive) setVersionOptions(v.map(x => x.id)) })
      .catch(() => { /* 离线时回退内置版本选项 */ })
    return () => { alive = false }
  }, [desktopEnv])

  /* 游戏退出事件：非零退出码 → 真实崩溃诊断 */
  useEffect(() => {
    if (!desktop) return
    let un: (() => void) | undefined
    onGameExit(code => {
      const instId = dLaunchRef.current.instanceId
      setDLaunch({ instanceId: null, pid: null, startedAt: 0 })
      const n = typeof code === 'number' ? code : -1
      if (n !== 0 && instId) {
        readDesktopLog(instId, 300)
          .then(log => {
            setCrashReport({ code: n, log, ...diagnoseLog(log) })
            setModal({ type: 'crash' })
          })
          .catch(() => {
            setCrashReport({ code: n, log: '', title: '游戏崩溃', cause: `进程退出码 ${n}`, suggestion: '导出求助包发到社区分析。' })
            setModal({ type: 'crash' })
          })
      } else {
        toast('游戏已退出', 'info')
      }
    }).then(u => { un = u }).catch(() => {})
    return () => { un?.() }
  }, [desktop, toast])

  /* 启动阶段副作用 */
  useEffect(() => {
    if (sim.launch.phase === 'running' && sim.launch.logs.length > 0) {
      const last = sim.launch.logs[sim.launch.logs.length - 1]
      if (last.text.includes('游戏窗口已创建')) toast('游戏已启动 · 启动器将隐藏到托盘（DEMO 中保持可见）', 'success')
    }
    if (sim.launch.phase === 'crashed') setModal({ type: 'crash' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sim.launch.phase])

  const setSettings = useCallback((patch: Partial<Settings>) => setSettingsState(s => ({ ...s, ...patch })), [])

  const addTask = useCallback((name: string, kind: DownloadTask['kind'], sizeMB: number, source: DownloadTask['source'] = 'Modrinth', instanceName?: string) => {
    dispatch({ type: 'add-task', task: { id: uid('d'), name, kind, sizeMB, progress: 0, speedMBs: 6 + Math.random() * 10, status: 'downloading', source, instanceName } })
  }, [])

  const startLaunch = useCallback((id?: string) => {
    if (desktop) {
      const inst = instances.find(i => i.id === (id ?? currentId))
      if (!inst) { toast('未选择实例', 'warning'); return }
      if (!inst.installed) { toast('请先安装游戏文件', 'warning'); return }
      const acc = accounts.find(a => a.id === currentAccId)
      if (!acc) {
        toast('请先添加账户（账户页）', 'warning')
        return
      }
      setCurrentId(inst.id)
      setPage('home')
      setDetailId(null)
      launchDesktopInstance(inst.id, acc.id, inst.memoryMB)
        .then(pid => {
          setDLaunch({ instanceId: inst.id, pid, startedAt: Date.now() })
          toast('游戏已启动，正在加载资源…', 'success')
        })
        .catch(e => toast(`启动失败：${e}`, 'danger'))
      return
    }
    const instId = id ?? currentId
    const inst = instances.find(i => i.id === instId)
    if (!inst) return
    setCurrentId(instId)
    setPage('home')
    setDetailId(null)
    dispatch({ type: 'start', instanceId: instId, crashDemo: !!inst.crashDemo, now: Date.now() })
  }, [currentId, instances, desktop, accounts, currentAccId, toast])

  const stopLaunch = useCallback(() => {
    if (desktop) {
      stopDesktopGame()
        .then(() => {
          setDLaunch({ instanceId: null, pid: null, startedAt: 0 })
          toast('已结束游戏', 'info')
        })
        .catch(e => toast(`结束失败：${e}`, 'danger'))
      return
    }
    dispatch({ type: 'stop' })
    toast('游戏已结束，启动器回到前台', 'info')
  }, [toast, desktop])

  const fixAndRelaunch = useCallback(() => {
    setMods(m => ({ ...m, i6: (m.i6 ?? []).map(mod => mod.id === CRASH_INFO.culpritId ? { ...mod, enabled: false } : mod) }))
    setInstances(list => list.map(i => i.id === 'i6' ? { ...i, crashDemo: false } : i))
    setModal(null)
    dispatch({ type: 'start', instanceId: 'i6', crashDemo: false, now: Date.now() })
    toast('已禁用 ExampleConflict，正在重新启动…', 'success')
  }, [toast])

  const exportHelp = useCallback(() => {
    if (desktop) {
      const id = dLaunchRef.current.instanceId ?? currentId
      exportHelpPack(id)
        .then(path => toast(`求助包已导出（已脱敏）：${path}`, 'success'))
        .catch(e => toast(`导出失败：${e}`, 'danger'))
      return
    }
    toast('求助包已导出：pomelo-help-20261126.zip（用户名 / 路径 / 令牌已脱敏）', 'success')
  }, [toast, desktop, currentId])

  const refreshAccounts = useCallback(() => {
    if (!desktop) return
    listDesktopAccounts()
      .then(list => {
        const mapped = list.map(mapDesktopAccount)
        setAccounts(mapped)
        setCurrentAccId(prev => (mapped.some(a => a.id === prev) ? prev : mapped[0]?.id ?? ''))
      })
      .catch(e => console.warn('refresh accounts failed', e))
  }, [desktop])

  const installResource = useCallback((res: ResourceItem, withDeps: boolean, targetId?: string) => {
    if (desktop) {
      const target = instances.find(i => i.id === (targetId ?? currentId))
      setModal(null)
      if (!target) { toast('未选择目标实例', 'warning'); return }
      if (res.category === 'modpack') { toast('整合包导入将在 M2 接入', 'warning'); return }
      if (!res.slug) { toast('该资源暂无 Modrinth 官方源', 'warning'); return }
      const taskId = `real-mod-${res.id}-${target.id}`
      setRealTasks(ts => [
        { id: taskId, name: `${res.zhName}（${res.name}）→ ${target.name}`, kind: res.category === 'mod' ? 'mod' : 'pack', sizeMB: 0, progress: 5, speedMBs: 0, status: 'downloading', source: 'Modrinth', instanceName: target.name },
        ...ts.filter(t => t.id !== taskId),
      ])
      installDesktopMod(target.id, res.slug, res.category)
        .then(fname => {
          setRealTasks(ts => ts.map(t => t.id === taskId ? { ...t, progress: 100, status: 'done', name: `${fname} → ${target.name}` } : t))
          toast(`已安装到 ${target.name}：${fname}`, 'success')
        })
        .catch(e => {
          setRealTasks(ts => ts.map(t => t.id === taskId ? { ...t, status: 'error', error: String(e) } : t))
          toast(`安装失败：${e}`, 'danger')
        })
      return
    }
    const target = instances.find(i => i.id === (targetId ?? currentId))
    const instName = res.category === 'modpack' ? res.zhName : target?.name
    const ext = res.category === 'modpack' ? 'mrpack' : res.category === 'mod' ? 'jar' : 'zip'
    addTask(`${res.name}-${res.versions[0]}.${ext}`, res.category === 'mod' ? 'mod' : 'pack', 1 + Math.random() * 6, 'Modrinth', instName)
    if (withDeps && res.deps) {
      for (const d of res.deps) addTask(`${d.name.split('（')[0]}-latest.jar`, 'mod', 1 + Math.random() * 2, 'Modrinth', instName)
    }
    if (res.category === 'modpack') {
      const id = uid('i')
      const loader = (res.loader ?? 'Fabric') as LoaderType
      setInstances(list => [{
        id, name: res.zhName, mcVersion: res.versions[0], loader,
        loaderVersion: loader === 'Fabric' ? '0.16.9' : loader === 'Forge' ? '47.3.0' : loader === 'NeoForge' ? '21.1.72' : loader === 'Quilt' ? '0.27.0' : undefined,
        icon: 'grass', tag: 'blue', favorite: false, lastPlayed: '从未', playTime: '0 小时',
        modsCount: 0, memoryMB: settings.memory, java: 'Java 21（自动）', isolation: true, installed: false,
      }, ...list])
      setMods(m => ({ ...m, [id]: [] }))
      toast(`整合包「${res.zhName}」将创建新实例，安装文件已加入队列`, 'success')
    } else if (targetId) {
      if (res.category === 'mod') {
        const modVer = target?.mcVersion && res.versions.includes(target.mcVersion) ? target.mcVersion : res.versions[0]
        const modsToAdd: Mod[] = [{
          id: uid('m'), name: res.name, zhName: res.zhName, version: modVer, enabled: true,
          sizeMB: Math.round((1 + Math.random() * 5) * 10) / 10, slug: res.slug,
        }]
        if (withDeps && res.deps) {
          for (const d of res.deps) {
            const depName = d.name.split('（')[0]
            const depZh = d.name.match(/（(.+)）/)?.[1] ?? depName
            modsToAdd.push({
              id: uid('m'), name: depName, zhName: depZh, version: modVer, enabled: true,
              sizeMB: Math.round((0.5 + Math.random() * 3) * 10) / 10, slug: depName.toLowerCase(),
            })
          }
        }
        setMods(m => ({ ...m, [targetId]: [...(m[targetId] ?? []), ...modsToAdd] }))
        setInstances(list => list.map(i => i.id === targetId ? { ...i, modsCount: i.modsCount + modsToAdd.length } : i))
      } else if (res.category === 'resourcepack' || res.category === 'shader') {
        setPacks(p => {
          const cur = p[targetId] ?? { resourcepacks: [], shaders: [] }
          const key = res.category === 'resourcepack' ? 'resourcepacks' : 'shaders'
          return { ...p, [targetId]: { ...cur, [key]: [...cur[key], { id: uid('p'), name: res.name, zhName: res.zhName, enabled: false }] } }
        })
      }
      toast(`已加入下载队列：${res.zhName} → ${instName}${withDeps && res.deps ? '（含前置）' : ''}`, 'success')
    }
    setInstalledIds(ids => [...ids, res.id])
    setModal(null)
  }, [addTask, instances, currentId, settings.memory, toast, desktop])

  const createInstance = useCallback((name: string, ver: string, loader: LoaderType) => {
    if (desktop) {
      const backendLoader = loader.toLowerCase()
      ;(async () => {
        try {
          const created = await createDesktopInstance(name, ver, backendLoader)
          const list = await listDesktopInstances()
          const mapped = list.map(mapDesktopInstance)
          setInstances(mapped)
          setCurrentId(created.id)
          setModal(null)
          setPage('instances')
          toast(
            loader === 'Fabric'
              ? `实例「${name}」已创建，Fabric 加载器与游戏文件安装完成`
              : `实例「${name}」已创建 · 游戏文件需在实例页确认安装`,
            'success',
          )
        } catch (e) {
          toast(`创建失败：${e}`, 'danger')
        }
      })()
      return
    }
    const id = uid('i')
    const tags: TagColor[] = ['green', 'blue', 'yellow', 'pink', 'purple', 'teal']
    setInstances(list => [{
      id, name, mcVersion: ver, loader,
      loaderVersion: loader === 'Fabric' ? '0.16.9' : loader === 'Forge' ? '47.3.0' : loader === 'NeoForge' ? '21.1.72' : loader === 'Quilt' ? '0.27.0' : undefined,
      icon: 'grass', tag: tags[list.length % tags.length], favorite: false,
      lastPlayed: '从未', playTime: '0 小时', modsCount: 0, memoryMB: settings.memory,
      java: ver.startsWith('b') || ver.startsWith('a') ? 'Java 8（自动）' : 'Java 21（自动）', isolation: true, installed: false,
    }, ...list])
    setMods(m => ({ ...m, [id]: [] }))
    setModal(null)
    setPage('instances')
    toast(`实例「${name}」已创建 · 游戏文件不会自动下载，请在实例页确认安装`, 'success')
  }, [settings.memory, toast, desktop])

  const installGame = useCallback((id: string) => {
    const inst = instances.find(i => i.id === id)
    if (!inst) return
    if (desktop) {
      if (inst.installed) return
      const taskId = `real-${id}`
      const run = async () => {
        setRealTasks(ts => [
          { id: taskId, name: `${inst.mcVersion} 游戏文件（准备中…）`, kind: 'game', sizeMB: 0, progress: 1, speedMBs: 0, status: 'downloading', source: 'BMCLAPI', instanceName: inst.name },
          ...ts.filter(t => t.id !== taskId),
        ])
        let off: (() => void) | undefined
        try {
          off = await onInstallProgress(p => {
            setRealTasks(ts => ts.map(t => t.id === taskId ? {
              ...t,
              progress: p.total ? Math.min(99, (p.current / p.total) * 100) : 2,
              name: `${inst.mcVersion} 游戏文件（${p.message}）`,
            } : t))
          })
          await installDesktopInstance(id, settings.source !== 'official')
          setRealTasks(ts => ts.map(t => t.id === taskId ? { ...t, progress: 100, status: 'done', name: `${inst.mcVersion} 游戏文件` } : t))
          setInstances(list => list.map(i => i.id === id ? { ...i, installed: true } : i))
          toast('游戏文件安装完成', 'success')
        } catch (e) {
          setRealTasks(ts => ts.map(t => t.id === taskId ? { ...t, status: 'error', error: String(e), name: `${inst.mcVersion} 游戏文件` } : t))
          toast(`安装失败：${e}`, 'danger')
        } finally {
          off?.()
        }
      }
      void run()
      return
    }
    if (inst.installed) return
    addTask(`${inst.mcVersion} 游戏文件（客户端 · 由你确认发起）`, 'game', 260, 'BMCLAPI', inst.name)
    setInstances(list => list.map(i => i.id === id ? { ...i, installed: true } : i))
    toast('安装任务已加入下载队列：版本下载始终由你确认发起', 'success')
  }, [instances, addTask, toast, desktop, settings.source])

  const value: Ctx = {
    page,
    go: p => { setPage(p); setDetailId(null) },
    detailId, openDetail: setDetailId,
    instances, currentId, setCurrentId,
    accounts, currentAccId, setCurrentAccId,
    addAccount: a => {
      if (desktop) {
        if (a.kind !== 'offline') {
          toast('Microsoft / 皮肤站登录将在下个里程碑接入', 'warning')
          return
        }
        addOfflineAccount(a.name)
          .then(list => {
            const mapped = list.map(mapDesktopAccount)
            setAccounts(mapped)
            const found = mapped.find(x => x.name === a.name)
            if (found) setCurrentAccId(found.id)
            toast(`账户「${a.name}」已添加并设为当前`, 'success')
          })
          .catch(e => toast(`添加失败：${e}`, 'danger'))
        return
      }
      setAccounts(list => [...list, a]); setCurrentAccId(a.id); toast(`账户「${a.name}」已添加并设为当前`, 'success')
    },
    removeAccount: id => {
      if (desktop) {
        removeDesktopAccount(id)
          .then(list => {
            const mapped = list.map(mapDesktopAccount)
            setAccounts(mapped)
            if (!mapped.some(x => x.id === currentAccId)) setCurrentAccId(mapped[0]?.id ?? '')
            toast('账户已删除', 'info')
          })
          .catch(e => toast(`删除失败：${e}`, 'danger'))
        return
      }
      setAccounts(list => list.filter(a => a.id !== id))
      if (currentAccId === id) setCurrentAccId(accounts.find(a => a.id !== id)?.id ?? '')
      toast('账户已删除', 'info')
    },
    mods,
    toggleMod: (instId, modId) => setMods(m => ({ ...m, [instId]: (m[instId] ?? []).map(x => x.id === modId ? { ...x, enabled: !x.enabled } : x) })),
    setAllMods: (instId, enabled) => setMods(m => ({ ...m, [instId]: (m[instId] ?? []).map(x => ({ ...x, enabled })) })),
    updateMod: (instId, modId) => {
      const mod = (mods[instId] ?? []).find(x => x.id === modId)
      if (!mod?.update) return
      setMods(m => ({ ...m, [instId]: (m[instId] ?? []).map(x => x.id === modId ? { ...x, version: x.update!, update: undefined } : x) }))
      addTask(`${mod.name}-${mod.update}.jar`, 'mod', mod.sizeMB, 'Modrinth')
      toast(`${mod.zhName} 更新已加入下载队列`, 'success')
    },
    checkUpdates: instId => {
      const list = mods[instId] ?? []
      const candidates = list.filter(x => !x.update)
      if (candidates.length === 0) { toast('所有模组均为最新版本', 'success'); return }
      const pick = candidates[Math.floor(Math.random() * candidates.length)]
      setMods(m => ({ ...m, [instId]: (m[instId] ?? []).map(x => x.id === pick.id ? { ...x, update: x.version.replace(/(\d+)$/, n => String(Number(n) + 1)) } : x) }))
      toast(`发现 1 个可更新模组：${pick.zhName}`, 'warning')
    },
    packs,
    togglePack: (instId, kind, id) => setPacks(p => ({ ...p, [instId]: { ...p[instId], [kind]: (p[instId]?.[kind] ?? []).map(x => x.id === id ? { ...x, enabled: !x.enabled } : x) } })),
    movePack: (instId, kind, id, dir) => setPacks(p => {
      const list = [...(p[instId]?.[kind] ?? [])]
      const i = list.findIndex(x => x.id === id)
      const j = i + dir
      if (i < 0 || j < 0 || j >= list.length) return p
      ;[list[i], list[j]] = [list[j], list[i]]
      return { ...p, [instId]: { ...p[instId], [kind]: list } }
    }),
    servers,
    addServer: (instId, name, address) => {
      setServers(sv => ({ ...sv, [instId]: [...(sv[instId] ?? []), { id: uid('sv'), name, address, ping: 10 + Math.floor(Math.random() * 180), online: Math.floor(Math.random() * 60), max: 100 }] }))
      toast(`服务器「${name}」已添加`, 'success')
    },
    removeServer: (instId, id) => setServers(sv => ({ ...sv, [instId]: (sv[instId] ?? []).filter(x => x.id !== id) })),
    saves,
    downloads: desktop ? realTasks : sim.downloads,
    dlOp: (id, op) => dispatch({ type: 'dl-op', id, op }),
    pauseAll: () => dispatch({ type: 'pause-all' }),
    resumeAll: () => dispatch({ type: 'resume-all' }),
    clearDone: () => dispatch({ type: 'clear-done' }),
    addTask,
    launch: sim.launch,
    startLaunch, stopLaunch, fixAndRelaunch, exportHelp,
    settings, setSettings,
    toasts, toast,
    modal, openModal: setModal, closeModal: () => setModal(null),
    wizardOpen,
    closeWizard: () => { setWizardOpen(false); localStorage.setItem('pomelo-demo-wizard', 'done') },
    openWizard: () => setWizardOpen(true),
    installedIds, installResource, createInstance, installGame,
    desktop, versionOptions, dLaunch, crashReport, refreshAccounts,
    toggleFavorite: id => setInstances(list => list.map(i => i.id === id ? { ...i, favorite: !i.favorite } : i)),
    updateInstance: (id, patch) => {
      if (desktop) {
        updateDesktopInstance(id, patch.memoryMB, patch.java)
          .then(d => setInstances(list => list.map(i => i.id === id ? { ...i, ...patch, memoryMB: d.memory_mb } : i)))
          .catch(e => toast(`保存失败：${e}`, 'danger'))
        return
      }
      setInstances(list => list.map(i => i.id === id ? { ...i, ...patch } : i))
    },
    logsFor: instId => {
      if (sim.launch.instanceId === instId && sim.launch.logs.length) return sim.launch.logs
      return [
        { t: '21:28:03', level: 'INFO', text: '[Render thread/INFO]: 上次启动：一切正常' },
        { t: '21:28:05', level: 'INFO', text: '[Render thread/INFO]: 已加载模组与资源包' },
        { t: '21:30:12', level: 'WARN', text: '[Server thread/WARN]: 区块加载耗时略高（演示数据）' },
        { t: '21:30:40', level: 'INFO', text: '[Render thread/INFO]: 游戏正常退出，退出码：0' },
      ]
    },
  }

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>
}
