/* 弹层：首启向导 / 崩溃诊断 / 新建实例 / 依赖安装确认 */
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from './store'
import { Icon, Logo, Modal, Select } from './ui'
import { CRASH_INFO, uid, LoaderType } from './mock'
import { isDesktop, listLoaderVersions, listVersions, LoaderBuild, DesktopVersion } from './desktop'
import { blockForVersion } from './mcBlocks'
import { chineseNameWarning } from './accountName'

/* ---------------- 首启向导（三步开玩） ---------------- */
export function Wizard() {
  const app = useApp()
  const [step, setStep] = useState(0)
  const [mode, setMode] = useState<'ms' | 'offline'>('ms')
  const [nick, setNick] = useState('')
  const nickWarning = chineseNameWarning(nick)

  const finish = () => {
    app.closeWizard()
    if (app.desktop) {
      app.toast('欢迎使用 PomeloLauncher 桌面版：请到「实例」新建实例并安装游戏文件', 'success')
      return
    }
    app.setCurrentId('i2')
    app.toast('欢迎使用 PomeloLauncher！已为你准备好 1.21.4 正式版', 'success')
  }

  return (
    <div className="wizard-scrim">
      <div className="wizard" role="dialog" aria-modal="true" aria-label="欢迎向导">
        {step === 0 && (
          <>
            <div className="logo-big"><Logo size={64} /></div>
            <h1>欢迎来到 PomeloLauncher</h1>
            <p className="lead">柚子启动器 · 剥开即玩。三步开始你的 Minecraft 之旅。</p>
            <div className="opts">
              {!app.desktop && (
                <button className="opt" onClick={() => { setMode('ms'); setStep(1) }}>
                  <Icon name="shield" />
                  <span><span className="t">正版登录</span><br /><span className="s">打开浏览器登录 Microsoft 账户，完成后自动回来</span></span>
                </button>
              )}
              <button className="opt" onClick={() => { setMode('offline'); setStep(1) }}>
                <Icon name="user" />
                <span><span className="t">先离线试试</span><br /><span className="s">{app.desktop ? '桌面版当前支持离线账户，随时可升级正版' : '本地昵称即可游玩，随时可升级正版'}</span></span>
              </button>
            </div>
          </>
        )}
        {step === 1 && mode === 'ms' && (
          <>
            <h1>授权 Microsoft 账户</h1>
            <p className="lead">在手机或另一台设备打开 <span className="mono">microsoft.com/link</span>，输入设备码：</p>
            <div className="device-code">POML-8K2F</div>
            <p className="muted small" style={{ margin: '12px 0 18px' }}>设备码流对国内网络更友好；也可在设置中配置代理。</p>
            <button className="btn primary block lg" onClick={() => { app.addAccount({ id: uid('a'), name: '柚子玩家_正版', kind: 'microsoft', skin: 'steve' }); setStep(2) }}>
              我已完成授权（演示）
            </button>
          </>
        )}
        {step === 1 && mode === 'offline' && (
          <>
            <h1>起个游戏昵称</h1>
            <p className="lead">离线账户无法进入启用正版验证的服务器，其余功能完全一致。</p>
            <div className="field" style={{ marginBottom: 18 }}>
              <input className="input" value={nick} onChange={e => setNick(e.target.value)} maxLength={16} placeholder="例如 Steve" style={{ fontSize: '1.1rem', padding: '10px 14px' }} />
              <span className="hint">3–16 个字符。Minecraft 通常不能使用中文游戏名。</span>
              {nickWarning && <span className="hint" style={{ color: 'var(--danger)' }}>{nickWarning}</span>}
            </div>
            <button className="btn primary block lg" disabled={nick.trim().length < 3 || !!nickWarning}
              onClick={() => { app.addAccount({ id: uid('a'), name: nick.trim(), kind: 'offline', skin: 'steve' }); setStep(2) }}>
              继续
            </button>
          </>
        )}
        {step === 2 && (
          <>
            <h1>一切就绪</h1>
            <p className="lead">已为你准备最新正式版，其余交给默认值：</p>
            <div className="ready-list">
              <div className="it"><Icon name="check" />Minecraft 1.21.4 正式版（新实例安装需你确认，不会自动下载）</div>
              <div className="it"><Icon name="check" />Java 21 自动匹配与下载，无需手动安装</div>
              <div className="it"><Icon name="check" />内存智能分配 4 GB，BMCLAPI 镜像优先</div>
              <div className="it"><Icon name="check" />版本隔离开启，模组与存档互不干扰</div>
            </div>
            <button className="btn primary block lg" onClick={finish}><Icon name="play" />开始使用</button>
          </>
        )}
        <div className="steps-dots">
          {[0, 1, 2].map(i => <i key={i} className={step === i ? 'on' : ''} />)}
        </div>
        {step < 2 && (
          <div style={{ textAlign: 'center', marginTop: 10 }}>
            <button className="btn quiet sm" onClick={app.closeWizard}>跳过向导</button>
          </div>
        )}
      </div>
    </div>
  )
}

/* ---------------- 崩溃诊断弹窗（桌面：真实日志诊断；浏览器：演示） ---------------- */
export function CrashModal() {
  const app = useApp()
  const [showDetail, setShowDetail] = useState(false)
  const real = app.crashReport
  const title = real?.title ?? CRASH_INFO.title
  const cause = real?.cause ?? CRASH_INFO.cause
  const suggestion = real?.suggestion ?? CRASH_INFO.suggestion
  const detail = real ? real.log : CRASH_INFO.detail
  return (
    <Modal title="崩溃诊断" onClose={app.closeModal} className="crash-modal"
      footer={<>
        <button className="btn quiet" onClick={() => setShowDetail(v => !v)}>{showDetail ? '收起详情' : '查看崩溃详情'}</button>
        <button className="btn ghost" onClick={app.closeModal}>关闭</button>
      </>}>
      <div className="crash-head">
        <div className="ic"><Icon name="alert" /></div>
        <div>
          <h3>{title}</h3>
          <p className="muted small">
            {real ? `进程退出码 ${real.code} · 已读取实例 logs/latest.log` : '实例：崩溃演示实例 · 退出码 1 · 已自动收集 latest.log 与 crash-report'}
          </p>
        </div>
      </div>
      <div className="crash-cause">
        <b>大概率原因：</b>{cause}
      </div>
      <p className="small"><Icon name="zap" size={14} /> <b>建议：</b>{suggestion}</p>
      <div className="crash-actions">
        {!real && (
          <button className="btn primary block" onClick={app.fixAndRelaunch}><Icon name="zap" />禁用 ExampleConflict 并重试</button>
        )}
        <button className="btn soft block" onClick={app.exportHelp}><Icon name="download" />导出求助包（已自动脱敏）</button>
      </div>
      {showDetail && <pre className="crash-detail">{detail}</pre>}
    </Modal>
  )
}

/* ---------------- 新建实例（版本目录 + 加载器版本） ---------------- */

const KIND_TABS: { id: string; label: string }[] = [
  { id: 'release', label: '正式版' },
  { id: 'snapshot', label: '快照' },
  { id: 'old', label: '远古' },
  { id: 'all', label: '全部' },
]

const LOADERS: { id: LoaderType; hint: string; installs: boolean }[] = [
  { id: 'Vanilla', hint: '不安装加载器', installs: true },
  { id: 'Fabric', hint: '创建时安装所选版本', installs: true },
  { id: 'Quilt', hint: '创建时安装所选版本', installs: true },
  { id: 'Forge', hint: '创建时运行 Forge 官方安装器', installs: true },
  { id: 'NeoForge', hint: '创建时运行 NeoForge 官方安装器', installs: true },
]

const DEMO_VERSIONS: DesktopVersion[] = [
  { id: '1.21.4', kind: 'release', latest: true },
  { id: '1.21.1', kind: 'release' },
  { id: '1.21', kind: 'release' },
  { id: '1.20.6', kind: 'release' },
  { id: '1.20.4', kind: 'release' },
  { id: '1.20.1', kind: 'release' },
  { id: '1.19.4', kind: 'release' },
  { id: '1.19.2', kind: 'release' },
  { id: '1.18.2', kind: 'release' },
  { id: '1.17.1', kind: 'release' },
  { id: '1.16.5', kind: 'release' },
  { id: '1.12.2', kind: 'release' },
  { id: '1.8.9', kind: 'release' },
  { id: '1.7.10', kind: 'release' },
  { id: '24w14a', kind: 'snapshot' },
  { id: 'b1.7.3', kind: 'old_beta' },
  { id: 'a1.2.6', kind: 'old_alpha' },
]

const DEMO_BUILDS: Record<string, LoaderBuild[]> = {
  Fabric: [
    { version: '0.16.10', stable: true },
    { version: '0.16.9', stable: true },
    { version: '0.15.11', stable: true },
  ],
  Quilt: [{ version: '0.27.1', stable: true }, { version: '0.26.4', stable: false }],
  Forge: [{ version: '47.3.0', stable: true }, { version: '47.2.0', stable: false }],
  NeoForge: [{ version: '21.1.72', stable: true }, { version: '21.1.1', stable: false }],
}

function kindMatches(kind: string, tab: string) {
  if (tab === 'all') return true
  if (tab === 'old') return kind === 'old_alpha' || kind === 'old_beta'
  return kind === tab
}

export function NewInstanceModal() {
  const app = useApp()
  const desktop = isDesktop()
  const [versions, setVersions] = useState<DesktopVersion[]>(desktop ? [] : DEMO_VERSIONS)
  const [verState, setVerState] = useState<'loading' | 'ready' | 'error'>(desktop ? 'loading' : 'ready')
  const [tab, setTab] = useState('release')
  const [query, setQuery] = useState('')
  const [ver, setVer] = useState(desktop ? '' : '1.21.4')
  const [name, setName] = useState(desktop ? '' : '1.21.4')
  const nameDirty = useRef(false)
  const [loader, setLoader] = useState<LoaderType>('Vanilla')
  const [builds, setBuilds] = useState<LoaderBuild[]>([])
  const [buildState, setBuildState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [loaderVer, setLoaderVer] = useState('')

  useEffect(() => {
    let on = true
    const apply = (list: DesktopVersion[]) => {
      if (!on || list.length === 0) return
      setVersions(list)
      const pick = list.find(v => v.latest && v.kind === 'release') ?? list.find(v => v.kind === 'release') ?? list[0]
      if (pick) {
        setVer(pick.id)
        setName(n => nameDirty.current ? n : pick.id)
      }
      setVerState('ready')
    }
    if (desktop) {
      listVersions(0, 'all').then(apply).catch(() => { if (on) setVerState('error') })
    } else {
      fetch('https://bmclapi2.bangbang93.com/mc/game/version_manifest_v2.json')
        .then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json() })
        .then((man: { versions?: { id: string; type: string }[]; latest?: { release?: string; snapshot?: string } }) => {
          const latestRelease = man.latest?.release
          const latestSnapshot = man.latest?.snapshot
          const list = (man.versions ?? []).map(v => ({
            id: v.id,
            kind: v.type,
            latest: v.id === latestRelease || v.id === latestSnapshot,
          }))
          apply(list)
        })
        .catch(() => { /* 浏览器跨域失败时沿用内置目录 */ })
    }
    return () => { on = false }
  }, [desktop])

  useEffect(() => {
    if (loader === 'Vanilla' || !ver) {
      setBuilds([])
      setLoaderVer('')
      setBuildState('idle')
      return
    }
    let on = true
    setBuildState('loading')
    const apply = (list: LoaderBuild[]) => {
      if (!on) return
      setBuilds(list)
      const pick = list.find(b => b.stable) ?? list[0]
      setLoaderVer(pick?.version ?? '')
      setBuildState(list.length ? 'ready' : 'ready')
    }
    const fallback = () => apply(DEMO_BUILDS[loader] ?? [])
    if (desktop) {
      listLoaderVersions(ver, loader.toLowerCase())
        .then(apply)
        .catch(() => { if (on) { setBuilds([]); setLoaderVer(''); setBuildState('error') } })
    } else if (loader === 'Fabric' || loader === 'Quilt') {
      const base = loader === 'Quilt'
        ? `https://meta.quiltmc.org/v3/versions/loader/${encodeURIComponent(ver)}`
        : `https://meta.fabricmc.net/v2/versions/loader/${encodeURIComponent(ver)}`
      fetch(base)
        .then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json() })
        .then((rows: { loader?: { version?: string; stable?: boolean } }[]) => {
          const list = rows.map(row => ({ version: row.loader?.version ?? '', stable: !!row.loader?.stable })).filter(b => b.version)
          if (list.length === 0) fallback()
          else apply(list)
        })
        .catch(fallback)
    } else {
      const url = loader === 'NeoForge'
        ? `https://bmclapi2.bangbang93.com/neoforge/list/${encodeURIComponent(ver)}`
        : `https://bmclapi2.bangbang93.com/forge/minecraft/${encodeURIComponent(ver)}`
      fetch(url)
        .then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json() })
        .then((rows: { version?: string }[]) => {
          const list = rows.map(row => row.version).filter((v): v is string => !!v)
          list.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
          const unique = [...new Set(list)].map((version, i) => ({ version, stable: i === 0 }))
          if (unique.length === 0) fallback()
          else apply(unique)
        })
        .catch(fallback)
    }
    return () => { on = false }
  }, [desktop, loader, ver])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return versions.filter(v => kindMatches(v.kind, tab) && (!q || v.id.toLowerCase().includes(q)))
  }, [versions, tab, query])

  const pickVersion = (id: string) => {
    setVer(id)
    if (!nameDirty) setName(id)
  }

  const loaderMeta = LOADERS.find(l => l.id === loader)!
  const needsBuild = loader !== 'Vanilla'
  const canCreate = name.trim().length > 0 && !!ver && (!needsBuild || !!loaderVer) && buildState !== 'loading' && buildState !== 'error'
  const actionLabel = loader === 'Vanilla' ? '创建实例' : '创建并安装'

  return (
    <Modal title="新建实例" onClose={app.closeModal} className="new-inst"
      footer={<>
        <span className="muted small dl-foot-note">
          {ver ? `${ver}${loader === 'Vanilla' ? ' · 原版' : ` · ${loader} ${loaderVer}`}` : '先选一个游戏版本'}
        </span>
        <span className="spacer" />
        <button className="btn ghost" onClick={app.closeModal}>取消</button>
        <button className="btn primary" disabled={!canCreate}
          onClick={() => app.createInstance(name.trim(), ver, loader, needsBuild ? loaderVer : undefined)}>
          {actionLabel}
        </button>
      </>}>
      <div className="dl-layout">
        <div className="dl-col">
          <input className="input" value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索版本，如 1.20.1" aria-label="搜索游戏版本" />
          <div className="dl-tabs" role="tablist" aria-label="版本类型">
            {KIND_TABS.map(t => (
              <button key={t.id} type="button" role="tab" aria-selected={tab === t.id}
                className={`chip ${tab === t.id ? 'primary' : 'outline'}`} onClick={() => setTab(t.id)}>{t.label}</button>
            ))}
          </div>
          <div className="dl-list" role="listbox" aria-label="游戏版本">
            {verState === 'loading' && <p className="dl-empty">正在获取 Mojang 版本清单…</p>}
            {verState === 'error' && <p className="dl-empty">版本清单获取失败，请检查网络后重开此窗口。</p>}
            {verState === 'ready' && shown.length === 0 && <p className="dl-empty">没有匹配的版本</p>}
            {verState === 'ready' && shown.map(v => (
              <button key={v.id} type="button" role="option" aria-selected={v.id === ver}
                className={`dl-item${v.id === ver ? ' active' : ''}`} onClick={() => pickVersion(v.id)}>
                <img className="ver-ico" src={blockForVersion(v.id, v.kind)} alt="" draggable={false} />
                <span className="num">{v.id}</span>
                {v.latest && <span className="chip accent">最新</span>}
                {v.kind !== 'release' && <span className="chip outline">{v.kind === 'snapshot' ? '快照' : v.kind === 'old_beta' ? 'Beta' : v.kind === 'old_alpha' ? 'Alpha' : v.kind}</span>}
              </button>
            ))}
          </div>
          <span className="hint">{verState === 'ready' ? `${shown.length} 个版本` : ' '}</span>
        </div>

        <div className="dl-col">
          <div className="field">
            <label htmlFor="inst-name">实例名称</label>
            <input id="inst-name" className="input" value={name} autoFocus
              onChange={e => { nameDirty.current = true; setName(e.target.value) }} placeholder="默认使用游戏版本号" />
          </div>
          <div className="dl-tabs" role="tablist" aria-label="模组加载器">
            {LOADERS.map(l => (
              <button key={l.id} type="button" role="tab" aria-selected={loader === l.id}
                className={`chip ${loader === l.id ? 'primary' : 'outline'}`} onClick={() => setLoader(l.id)}>
                {l.id === 'Vanilla' ? '原版' : l.id}
              </button>
            ))}
          </div>
          <p className="hint" style={{ margin: 0 }}>{loaderMeta.hint}</p>
          {loader === 'Vanilla' ? (
            <div className="dl-list">
              <p className="dl-empty">原版不需要加载器。创建后到实例页确认安装游戏文件。</p>
            </div>
          ) : (
            <div className="dl-list" role="listbox" aria-label={`${loader} 版本`}>
              {buildState === 'loading' && <p className="dl-empty">正在获取 {loader} 版本…</p>}
              {buildState === 'error' && <p className="dl-empty">{loader} 版本获取失败。</p>}
              {buildState === 'ready' && builds.length === 0 && <p className="dl-empty">这个游戏版本没有可用的 {loader}。</p>}
              {buildState !== 'loading' && builds.map(b => (
                <button key={b.version} type="button" role="option" aria-selected={b.version === loaderVer}
                  className={`dl-item${b.version === loaderVer ? ' active' : ''}`} onClick={() => setLoaderVer(b.version)}>
                  <span className="num">{b.version}</span>
                  {b.stable && <span className="chip success">稳定</span>}
                </button>
              ))}
            </div>
          )}
          {(loader === 'Forge' || loader === 'NeoForge') && (
            <span className="hint">会下载官方安装器并用本机 Java 执行，时间可能比原版安装更长。</span>
          )}
          {(loader === 'Fabric' || loader === 'Quilt') && (
            <span className="hint">点「创建并安装」会下载所选加载器和游戏文件，请保持网络可用。</span>
          )}
        </div>
      </div>
    </Modal>
  )
}

/* ---------------- 依赖安装确认（含实例选择） ---------------- */
export function InstallModal({ res }: { res: import('./mock').ResourceItem }) {
  const app = useApp()
  const [withDeps, setWithDeps] = useState(true)
  const [target, setTarget] = useState(app.currentId)
  const isPack = res.category === 'modpack'
  const targetInst = app.instances.find(i => i.id === target)
  return (
    <Modal title={`安装 ${res.zhName}`} onClose={app.closeModal}
      footer={<>
        <button className="btn ghost" onClick={app.closeModal}>取消</button>
        <button className="btn primary" onClick={() => app.installResource(res, withDeps, isPack ? undefined : target)}><Icon name="download" />确认安装</button>
      </>}>
      <p className="small muted" style={{ marginBottom: 12 }}>{res.name} · {isPack ? '将创建新实例并下载整合包' : '请选择安装到的实例'}</p>
      {!isPack && (
        <div className="field" style={{ marginBottom: 12 }}>
          <label>安装到实例</label>
          <Select ariaLabel="安装到实例" width="100%" value={target} onChange={setTarget}
            options={app.instances.map(i => ({ value: i.id, label: `${i.name}（${i.mcVersion}${i.loader !== 'Vanilla' ? ' · ' + i.loader : ''}）` }))} />
          {targetInst?.installed === false && (
            <span className="hint" style={{ color: 'var(--warning)' }}>该实例尚未安装游戏文件，需先在实例页完成安装才能启动。</span>
          )}
        </div>
      )}
      {isPack && (
        <div className="card pad" style={{ background: 'var(--surface-2)', borderColor: 'transparent', marginBottom: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}><Icon name="layers" size={14} /> 将新建实例「{res.zhName}」</div>
          <span className="muted small">{res.versions[0]} · {res.loader ?? 'Fabric'} · 下载完成后自动导入，原实例不受影响</span>
        </div>
      )}
      {res.deps && (
        <div className="card pad" style={{ background: 'var(--warning-soft)', borderColor: 'transparent' }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}><Icon name="alert" size={14} /> 需要以下前置模组：</div>
          {res.deps.map(d => (
            <label key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '4px 0', cursor: 'pointer' }}>
              <input type="checkbox" checked={withDeps} onChange={e => setWithDeps(e.target.checked)} style={{ accentColor: 'var(--primary)', width: 15, height: 15 }} />
              <span>{d.name}</span>
            </label>
          ))}
          <p className="muted small" style={{ marginTop: 8 }}>缺少前置会导致启动失败，建议一并安装（启动前检查也会拦截）。</p>
        </div>
      )}
    </Modal>
  )
}
