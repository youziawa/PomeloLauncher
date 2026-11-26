/* PomeloLauncher DEMO — 合成演示数据（全部为 mock，正式版接 pomelo-core） */

export type LoaderType = 'Vanilla' | 'Fabric' | 'Forge' | 'NeoForge' | 'Quilt'
export type IconKind = 'grass' | 'gear' | 'camera' | 'clock' | 'bug' | 'island'
export type TagColor = 'green' | 'blue' | 'yellow' | 'pink' | 'purple' | 'teal'

export interface Instance {
  id: string
  name: string
  mcVersion: string
  loader: LoaderType
  loaderVersion?: string
  icon: IconKind
  tag: TagColor
  favorite: boolean
  lastPlayed: string
  playTime: string
  modsCount: number
  memoryMB: number
  java: string
  crashDemo?: boolean
  isolation: boolean
  autoServer?: string
  installed?: boolean
}

export interface Account {
  id: string
  name: string
  kind: 'microsoft' | 'offline' | 'authlib'
  server?: string
  skin: 'steve' | 'alex' | 'pomelo'
}

export interface Mod {
  id: string
  name: string
  zhName: string
  version: string
  enabled: boolean
  sizeMB: number
  update?: string
  culprit?: boolean
  slug?: string
}

export interface PackItem { id: string; name: string; zhName: string; enabled: boolean; note?: string }

export interface Server { id: string; name: string; address: string; ping: number; online: number; max: number }
export interface Save { id: string; name: string; mode: string; version: string; lastPlayed: string; sizeMB: number }

export type ResCategory = 'mod' | 'resourcepack' | 'shader' | 'modpack' | 'world'
export interface ResourceItem {
  id: string
  name: string
  zhName: string
  category: ResCategory
  desc: string
  downloads: string
  versions: string[]
  loader?: string
  deps?: { id: string; name: string }[]
  tone: string
  slug?: string
}

export type DlStatus = 'downloading' | 'paused' | 'done' | 'error'
export interface DownloadTask {
  id: string
  name: string
  kind: 'game' | 'java' | 'mod' | 'pack' | 'asset'
  sizeMB: number
  progress: number
  speedMBs: number
  status: DlStatus
  source: 'BMCLAPI' | 'Mojang' | 'Modrinth' | 'CurseForge'
  error?: string
  instanceName?: string
}

export interface LogLine { t: string; level: 'INFO' | 'WARN' | 'ERROR'; text: string }

export const TAG_COLORS: Record<TagColor, string> = {
  green: '#7BA23F', blue: '#4A90D9', yellow: '#D9A03F', pink: '#D96C8E', purple: '#8B6FC9', teal: '#3FA69B',
}

export const ACCENTS = [
  { key: 'green', label: '柚叶绿', l: '#7BA23F' },
  { key: 'blue', label: '海盐蓝', l: '#4A90D9' },
  { key: 'orange', label: '柑橘橙', l: '#E8853D' },
  { key: 'pink', label: '樱花粉', l: '#D96C8E' },
  { key: 'purple', label: '薰衣紫', l: '#8B6FC9' },
  { key: 'teal', label: '青碧', l: '#3FA69B' },
  { key: 'graphite', label: '石墨', l: '#6B7280' },
  { key: 'yellow', label: '柚瓤黄', l: '#D9A03F' },
]

export const initialInstances: Instance[] = [
  { id: 'i1', name: '柚子的整合包', mcVersion: '1.21.4', loader: 'Fabric', loaderVersion: '0.16.9', icon: 'grass', tag: 'green', favorite: true, lastPlayed: '昨天 21:30', playTime: '42.5 小时', modsCount: 47, memoryMB: 4096, java: 'Java 21（自动）', isolation: true, installed: true },
  { id: 'i2', name: '原味生存', mcVersion: '1.21.4', loader: 'Vanilla', icon: 'island', tag: 'teal', favorite: true, lastPlayed: '3 天前', playTime: '18.2 小时', modsCount: 0, memoryMB: 2048, java: 'Java 21（自动）', isolation: true, installed: true },
  { id: 'i3', name: '科技空岛', mcVersion: '1.20.1', loader: 'Forge', loaderVersion: '47.3.0', icon: 'gear', tag: 'blue', favorite: false, lastPlayed: '上周', playTime: '96.1 小时', modsCount: 132, memoryMB: 6144, java: 'Java 17（自动）', isolation: true, installed: true },
  { id: 'i4', name: '光影摄影', mcVersion: '1.21.1', loader: 'NeoForge', loaderVersion: '21.1.72', icon: 'camera', tag: 'yellow', favorite: false, lastPlayed: '2 周前', playTime: '7.8 小时', modsCount: 12, memoryMB: 4096, java: 'Java 21（自动）', isolation: true, installed: true },
  { id: 'i5', name: '远古回忆', mcVersion: 'b1.7.3', loader: 'Vanilla', icon: 'clock', tag: 'purple', favorite: false, lastPlayed: '上个月', playTime: '3.1 小时', modsCount: 0, memoryMB: 1024, java: 'Java 8（自动）', isolation: true, installed: true },
  { id: 'i6', name: '崩溃演示实例', mcVersion: '1.20.1', loader: 'Forge', loaderVersion: '47.3.0', icon: 'bug', tag: 'pink', favorite: false, lastPlayed: '从未', playTime: '0 小时', modsCount: 3, memoryMB: 4096, java: 'Java 17（自动）', crashDemo: true, isolation: true, installed: true },
]

export const initialAccounts: Account[] = [
  { id: 'a1', name: 'Steve_柚子', kind: 'microsoft', skin: 'steve' },
  { id: 'a2', name: '柚子酱', kind: 'authlib', server: 'LittleSkin', skin: 'alex' },
  { id: 'a3', name: '离线玩家', kind: 'offline', skin: 'steve' },
]

export const initialMods: Record<string, Mod[]> = {
  i1: [
    { id: 'm1', name: 'Sodium', zhName: '钠', version: '0.6.5', enabled: true, sizeMB: 1.2, slug: 'sodium' },
    { id: 'm2', name: 'Iris Shaders', zhName: '虹膜光影', version: '1.8.4', enabled: true, sizeMB: 2.8, slug: 'iris' },
    { id: 'm3', name: 'Lithium', zhName: '锂', version: '0.14.3', enabled: true, sizeMB: 0.7, slug: 'lithium' },
    { id: 'm4', name: 'Fabric API', zhName: 'Fabric 前置', version: '0.110.0', enabled: true, sizeMB: 2.1, slug: 'fabric-api' },
    { id: 'm5', name: 'Mod Menu', zhName: '模组菜单', version: '12.0.0', enabled: true, sizeMB: 0.9, update: '12.1.0', slug: 'modmenu' },
    { id: 'm6', name: "Xaero's Minimap", zhName: 'Xaero 小地图', version: '24.6.1', enabled: true, sizeMB: 1.6, slug: 'xaeros-minimap' },
    { id: 'm7', name: 'AppleSkin', zhName: '苹果皮', version: '3.0.6', enabled: true, sizeMB: 0.1, slug: 'appleskin' },
    { id: 'm8', name: 'Jade', zhName: '玉 · 信息显示', version: '15.9.2', enabled: false, sizeMB: 0.8, slug: 'jade' },
    { id: 'm9', name: 'Create', zhName: '机械动力', version: '6.0.4', enabled: true, sizeMB: 18.4, update: '6.0.6', slug: 'create' },
    { id: 'm10', name: 'JourneyMap', zhName: '旅行地图', version: '6.0.0', enabled: false, sizeMB: 3.2, slug: 'journeymap' },
  ],
  i3: [
    { id: 'm20', name: 'Applied Energistics 2', zhName: '应用能源 2', version: '15.2.13', enabled: true, sizeMB: 6.4, slug: 'applied-energistics-2' },
    { id: 'm21', name: 'Mekanism', zhName: '通用机械', version: '10.4.9', enabled: true, sizeMB: 12.8, slug: 'mekanism' },
    { id: 'm22', name: 'Botania', zhName: '植物魔法', version: '446', enabled: true, sizeMB: 9.1, slug: 'botania' },
    { id: 'm23', name: 'JEI', zhName: 'JEI 物品管理器', version: '15.20.0', enabled: true, sizeMB: 1.4, update: '15.21.0', slug: 'jei' },
  ],
  i4: [
    { id: 'm30', name: 'Iris', zhName: '虹膜光影', version: '1.8.4', enabled: true, sizeMB: 2.8, slug: 'iris' },
    { id: 'm31', name: 'Sodium', zhName: '钠', version: '0.6.5', enabled: true, sizeMB: 1.2, slug: 'sodium' },
    { id: 'm32', name: 'Distant Horizons', zhName: '遥远地平线', version: '2.2.1', enabled: true, sizeMB: 4.6, slug: 'distant-horizons' },
  ],
  i6: [
    { id: 'm40', name: 'ExampleConflict', zhName: '示例冲突 Mod', version: '1.2.0', enabled: true, sizeMB: 0.4, culprit: true },
    { id: 'm41', name: 'AnotherMod', zhName: '另一个 Mod', version: '3.1.0', enabled: true, sizeMB: 1.1 },
    { id: 'm42', name: 'Forge Config API', zhName: 'Forge 配置前置', version: '8.0.1', enabled: true, sizeMB: 0.3 },
  ],
  i2: [], i5: [],
}

export const initialPacks: Record<string, { resourcepacks: PackItem[]; shaders: PackItem[] }> = {
  i1: {
    resourcepacks: [
      { id: 'p1', name: 'Faithful 32x', zhName: '忠实 32x 材质', enabled: true },
      { id: 'p2', name: 'Fresh Animations', zhName: '生动生物动画', enabled: true },
      { id: 'p3', name: 'Bare Bones', zhName: '极简材质', enabled: false },
    ],
    shaders: [
      { id: 's1', name: 'Complementary Reimagined', zhName: '互补 · 重构光影', enabled: true },
      { id: 's2', name: 'BSL Shaders', zhName: 'BSL 光影', enabled: false },
    ],
  },
  i4: {
    resourcepacks: [{ id: 'p10', name: 'Pomelo Photo', zhName: '柚子摄影材质', enabled: true }],
    shaders: [
      { id: 's10', name: 'Photon', zhName: '光子光影', enabled: true },
      { id: 's11', name: 'Complementary Unbound', zhName: '互补 · 无界光影', enabled: false },
    ],
  },
}

export const initialServers: Record<string, Server[]> = {
  i1: [
    { id: 'sv1', name: '柚子小镇', address: 'mc.pomelo.example', ping: 32, online: 12, max: 50 },
    { id: 'sv2', name: 'Hypixel', address: 'mc.hypixel.net', ping: 218, online: 41203, max: 200000 },
    { id: 'sv3', name: '校园服 · SJTU', address: 'mc.sjtu.example', ping: 8, online: 27, max: 100 },
  ],
  i2: [{ id: 'sv10', name: '柚子小镇', address: 'mc.pomelo.example', ping: 32, online: 12, max: 50 }],
}

export const initialSaves: Record<string, Save[]> = {
  i1: [
    { id: 'w1', name: '新的世界', mode: '生存', version: '1.21.4', lastPlayed: '昨天 21:30', sizeMB: 86 },
    { id: 'w2', name: '空岛基地', mode: '创造', version: '1.21.4', lastPlayed: '上周', sizeMB: 132 },
    { id: 'w3', name: '红石试验场', mode: '创造', version: '1.21.4', lastPlayed: '2 周前', sizeMB: 41 },
  ],
  i2: [{ id: 'w10', name: '海边小屋', mode: '生存', version: '1.21.4', lastPlayed: '3 天前', sizeMB: 58 }],
  i3: [{ id: 'w20', name: '科技空岛 · 主岛', mode: '生存', version: '1.20.1', lastPlayed: '上周', sizeMB: 420 }],
}

export const resourceCatalog: ResourceItem[] = [
  { id: 'r1', name: 'Sodium', zhName: '钠', category: 'mod', desc: '强大的渲染优化模组，大幅提升帧率，兼容主流光影加载器。', downloads: '4,210 万', versions: ['1.21.4', '1.21.1', '1.20.1'], loader: 'Fabric', tone: '#4A90D9', slug: 'sodium' },
  { id: 'r2', name: 'Iris Shaders', zhName: '虹膜光影', category: 'mod', desc: '现代光影加载器，与 Sodium 协同工作，支持绝大多数光影包。', downloads: '2,870 万', versions: ['1.21.4', '1.21.1'], loader: 'Fabric', deps: [{ id: 'r1', name: 'Sodium（钠）' }], tone: '#8B6FC9', slug: 'iris' },
  { id: 'r3', name: 'Lithium', zhName: '锂', category: 'mod', desc: '通用游戏逻辑优化，不改变任何原版机制，服务端同样有效。', downloads: '2,350 万', versions: ['1.21.4', '1.20.1'], loader: 'Fabric', tone: '#3FA69B', slug: 'lithium' },
  { id: 'r4', name: 'Fabric API', zhName: 'Fabric 前置', category: 'mod', desc: 'Fabric 模组的基础前置库，绝大多数 Fabric 模组都需要它。', downloads: '5,120 万', versions: ['1.21.4', '1.21.1', '1.20.1'], loader: 'Fabric', tone: '#D9A03F', slug: 'fabric-api' },
  { id: 'r5', name: 'Create', zhName: '机械动力', category: 'mod', desc: '以旋转动力为核心的科技模组，搭建传送带、齿轮与自动化农场。', downloads: '1,980 万', versions: ['1.21.1', '1.20.1'], loader: 'NeoForge', tone: '#E8853D', slug: 'create' },
  { id: 'r6', name: 'Complementary Reimagined', zhName: '互补 · 重构光影', category: 'shader', desc: '画面与性能平衡的光影包，水面反射、体积云与柔和光照。', downloads: '1,420 万', versions: ['1.21.4', '1.20.1'], tone: '#D96C8E', slug: 'complementary-reimagined' },
  { id: 'r7', name: 'Faithful 32x', zhName: '忠实 32x 材质', category: 'resourcepack', desc: '保留原版风格的高清材质包，细节更丰富而不失原味。', downloads: '980 万', versions: ['1.21.4', '1.21.1'], tone: '#7BA23F', slug: 'faithful-32x' },
  { id: 'r8', name: 'Fresh Animations', zhName: '生动生物动画', category: 'resourcepack', desc: '为生物添加流畅自然的动画，需要 OptiFine 或 ETF/EMF 支持。', downloads: '760 万', versions: ['1.21.4'], tone: '#3FA69B', slug: 'fresh-animations' },
  { id: 'r9', name: 'Fabulously Optimized', zhName: '极致优化整合包', category: 'modpack', desc: '以优化为核心的轻量整合包，开箱即用的流畅体验。', downloads: '540 万', versions: ['1.21.4'], loader: 'Fabric', tone: '#4A90D9', slug: 'fabulously-optimized' },
  { id: 'r10', name: 'Skyblock Legacy', zhName: '经典空岛世界', category: 'world', desc: '一棵树、一箱物资，从浮空岛开始你的生存挑战。', downloads: '210 万', versions: ['1.21.4'], tone: '#D9A03F' },
  { id: 'r11', name: 'Mod Menu', zhName: '模组菜单', category: 'mod', desc: '在游戏内查看与管理已安装模组，支持配置入口。', downloads: '3,640 万', versions: ['1.21.4', '1.20.1'], loader: 'Fabric', tone: '#6B7280', slug: 'modmenu' },
  { id: 'r12', name: 'BSL Shaders', zhName: 'BSL 光影', category: 'shader', desc: '风格化光影，柔和色调与出色氛围，摄影玩家最爱。', downloads: '1,130 万', versions: ['1.21.4', '1.20.1'], tone: '#8B6FC9', slug: 'bsl-shaders' },
]

export const initialDownloads: DownloadTask[] = [
  { id: 'd2', name: 'fabric-api-0.110.0+1.21.4.jar', kind: 'mod', sizeMB: 2.1, progress: 100, speedMBs: 0, status: 'done', source: 'Modrinth', instanceName: '柚子的整合包' },
  { id: 'd3', name: 'Java 21.0.5（Mojang 运行时）', kind: 'java', sizeMB: 46, progress: 100, speedMBs: 0, status: 'done', source: 'Mojang' },
  { id: 'd4', name: 'ComplementaryReimagined_r5.3.zip', kind: 'pack', sizeMB: 8.6, progress: 34, speedMBs: 0, status: 'paused', source: 'Modrinth', instanceName: '光影摄影' },
  { id: 'd5', name: 'photon-shader-v1.2a.zip', kind: 'pack', sizeMB: 6.2, progress: 78, speedMBs: 0, status: 'error', source: 'CurseForge', error: 'SHA1 校验失败，文件可能损坏', instanceName: '光影摄影' },
]

export const PREFLIGHT_CHECKS = [
  'Java 21 已就绪（自动匹配）',
  '内存分配 4 GB · 系统余量充足',
  '前置模组完整（Fabric API ✓）',
  '游戏文件完整性校验通过',
  '账户令牌有效',
]

export const LAUNCH_MILESTONES: { at: number; line: string }[] = [
  { at: 4, line: '解析版本 JSON：1.21.4（inheritsFrom: fabric-loader-0.16.9）' },
  { at: 14, line: '校验资产完整性… 214 个文件全部通过' },
  { at: 28, line: '构建类路径：87 个库，解压 natives 至临时目录' },
  { at: 42, line: '注入 JVM 参数：-Xmx4G -XX:+UseG1GC -XX:+UnlockExperimentalVMOptions' },
  { at: 56, line: '挂载 LWJGL Unsafe Agent（性能修复，适用版本已核对）' },
  { at: 70, line: '组装游戏参数：--username Steve_柚子 --accessToken ***（已脱敏）' },
  { at: 86, line: '启动游戏进程（PID 12345），工作目录：instances/i1/.minecraft' },
]

export const AMBIENT_LOGS = [
  '[Render thread/INFO]: OpenGL 4.6.0 NVIDIA 566.14',
  '[Render thread/INFO]: 已加载 47 个模组（Fabric Loader 0.16.9）',
  '[Render thread/INFO]: Sodium 0.6.5 渲染后端已启用',
  '[Render thread/INFO]: 声音引擎初始化完成（OpenAL Soft）',
  '[Worker-Main/INFO]: 已加载 128 个资源包条目',
  '[Render thread/INFO]: 进入世界：新的世界',
  '[Server thread/INFO]: 正在准备生成区域… 62%',
  '[Render thread/INFO]: 光影管线：Complementary Reimagined 已编译',
]

export const CRASH_LINES: LogLine[] = [
  { t: '01:02:41', level: 'ERROR', text: '[Render thread/FATAL]: Mixin apply for mod exampleconflict failed' },
  { t: '01:02:41', level: 'ERROR', text: 'org.spongepowered.asm.mixin.transformer.throwables.MixinApplyError:' },
  { t: '01:02:41', level: 'ERROR', text: '  @Inject target net.minecraft.client.renderer.LevelRenderer was already redirected by anothermod' },
  { t: '01:02:41', level: 'ERROR', text: '  at exampleconflict/mixin/RendererMixin.java:42' },
  { t: '01:02:42', level: 'ERROR', text: 'Caused by: org.spongepowered.asm.mixin.injection.throwables.InjectionError' },
  { t: '01:02:42', level: 'ERROR', text: '游戏进程已退出，退出码：1' },
]

export const CRASH_INFO = {
  title: '游戏崩溃了',
  cause: 'Mod「ExampleConflict（示例冲突 Mod）」与「AnotherMod（另一个 Mod）」同时修改了渲染器，发生 Mixin 注入冲突。',
  suggestion: '禁用 ExampleConflict 后重试；或将两个 Mod 更新到互相兼容的版本。',
  culpritId: 'm40',
  detail: CRASH_LINES.map(l => `[${l.t}] [${l.level}] ${l.text}`).join('\n') + '\n\n—— 求助包将自动脱敏：用户名 / 本机路径 / 令牌 / 服务器 IP ——',
}

export const TIPS = [
  '柚子小贴士：版本下载永远由你确认发起，启动器不会在后台自动下载游戏版本。',
  '柚子小贴士：崩溃弹窗里的「导出求助包」已自动脱敏，可放心发到社区。',
  '柚子小贴士：在首页滚动鼠标滚轮，可以快速切换实例与账户。',
  '柚子小贴士：下载失败会自动回退到官方源重试，无需手动干预。',
]

let seq = 100
export const uid = (p: string) => `${p}${++seq}`
export const nowTime = () => new Date().toTimeString().slice(0, 8)
