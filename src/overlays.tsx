/* 弹层：首启向导 / 崩溃诊断 / 新建实例 / 依赖安装确认 */
import React, { useState } from 'react'
import { useApp } from './store'
import { Icon, Logo, Modal, Select } from './ui'
import { CRASH_INFO, uid, LoaderType } from './mock'

/* ---------------- 首启向导（三步开玩） ---------------- */
export function Wizard() {
  const app = useApp()
  const [step, setStep] = useState(0)
  const [mode, setMode] = useState<'ms' | 'offline'>('ms')
  const [nick, setNick] = useState('柚子玩家')

  const finish = () => {
    app.setCurrentId('i2')
    app.closeWizard()
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
              <button className="opt" onClick={() => { setMode('ms'); setStep(1) }}>
                <Icon name="shield" />
                <span><span className="t">正版登录</span><br /><span className="s">Microsoft 设备码，手机扫码即可，无需输入密码</span></span>
              </button>
              <button className="opt" onClick={() => { setMode('offline'); setStep(1) }}>
                <Icon name="user" />
                <span><span className="t">先离线试试</span><br /><span className="s">本地昵称即可游玩，随时可升级正版</span></span>
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
              <input className="input" value={nick} onChange={e => setNick(e.target.value)} maxLength={16} style={{ fontSize: '1.1rem', padding: '10px 14px' }} />
              <span className="hint">3–16 个字符，之后可以在账户页修改皮肤</span>
            </div>
            <button className="btn primary block lg" disabled={nick.trim().length < 3}
              onClick={() => { app.addAccount({ id: uid('a'), name: nick.trim(), kind: 'offline', skin: 'pomelo' }); setStep(2) }}>
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

/* ---------------- 崩溃诊断弹窗 ---------------- */
export function CrashModal() {
  const app = useApp()
  const [showDetail, setShowDetail] = useState(false)
  return (
    <Modal title="崩溃诊断" onClose={app.closeModal} className="crash-modal"
      footer={<>
        <button className="btn quiet" onClick={() => setShowDetail(v => !v)}>{showDetail ? '收起详情' : '查看崩溃详情'}</button>
        <button className="btn ghost" onClick={app.closeModal}>关闭</button>
      </>}>
      <div className="crash-head">
        <div className="ic"><Icon name="alert" /></div>
        <div>
          <h3>{CRASH_INFO.title}</h3>
          <p className="muted small">实例：崩溃演示实例 · 退出码 1 · 已自动收集 latest.log 与 crash-report</p>
        </div>
      </div>
      <div className="crash-cause">
        <b>大概率原因：</b>{CRASH_INFO.cause}
      </div>
      <p className="small"><Icon name="zap" size={14} /> <b>建议：</b>{CRASH_INFO.suggestion}</p>
      <div className="crash-actions">
        <button className="btn primary block" onClick={app.fixAndRelaunch}><Icon name="zap" />禁用 ExampleConflict 并重试</button>
        <button className="btn soft block" onClick={app.exportHelp}><Icon name="download" />导出求助包（已自动脱敏）</button>
      </div>
      {showDetail && <pre className="crash-detail">{CRASH_INFO.detail}</pre>}
    </Modal>
  )
}

/* ---------------- 新建实例 ---------------- */
export function NewInstanceModal() {
  const app = useApp()
  const [name, setName] = useState('')
  const [ver, setVer] = useState('1.21.4')
  const [loader, setLoader] = useState<LoaderType>('Vanilla')
  return (
    <Modal title="新建实例" onClose={app.closeModal}
      footer={<>
        <button className="btn ghost" onClick={app.closeModal}>取消</button>
        <button className="btn primary" disabled={name.trim().length === 0} onClick={() => app.createInstance(name.trim(), ver, loader)}>创建实例</button>
      </>}>
      <div className="settings-form">
        <div className="field">
          <label>实例名称</label>
          <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="例如：我的光影世界" autoFocus />
        </div>
        <div className="field">
          <label>游戏版本</label>
          <Select ariaLabel="游戏版本" width={260} value={ver} onChange={setVer} options={[
            { value: '1.21.4', label: '1.21.4（最新正式版）' },
            { value: '1.21.1', label: '1.21.1' },
            { value: '1.20.1', label: '1.20.1（模组生态热门）' },
            { value: '1.19.4', label: '1.19.4' },
            { value: 'b1.7.3', label: 'b1.7.3（远古版）' },
          ]} />
          <span className="hint">快照 / 愚人节版 / 远古版完整版可在版本过滤器中选择</span>
        </div>
        <div className="field">
          <label>模组加载器</label>
          <Select ariaLabel="模组加载器" width={260} value={loader} onChange={v => setLoader(v as LoaderType)} options={[
            { value: 'Vanilla', label: '原版（不安装加载器）' },
            { value: 'Fabric', label: 'Fabric（轻量，推荐新手）' },
            { value: 'Forge', label: 'Forge（大型模组生态）' },
            { value: 'NeoForge', label: 'NeoForge' },
            { value: 'Quilt', label: 'Quilt' },
          ]} />
          <span className="hint">OptiFine / LiteLoader 等将在正式版 M2 提供</span>
        </div>
        <p className="muted small">创建后不会自动下载游戏文件；在实例页点击「安装游戏文件」并由你确认后才会开始下载。</p>
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
