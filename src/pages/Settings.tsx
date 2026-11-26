/* 设置页：外观 / 启动 / 下载 / 隐私 / 桌面核心 / 关于（可搜索） */
import React, { useEffect, useState } from 'react'
import { useApp } from '../store'
import { Icon, Toggle, Logo, Select } from '../ui'
import { ACCENTS } from '../mock'
import { isDesktop, getSystemInfo, listJava, openDataDir, getMsClientId, setMsClientId, SystemInfo, JavaInfo } from '../desktop'

/* 模块级组件：避免内联定义导致每次渲染重挂载（滑杆拖拽会被打断） */
const matchQ = (q: string, t: string, hint = '') => q === '' || (t + hint).toLowerCase().includes(q.toLowerCase())

function Row({ t, hint, ctl, q }: { t: string; hint?: string; ctl: React.ReactNode; q: string }) {
  if (!matchQ(q, t, hint)) return null
  return (
    <div className="set-row">
      <div className="txt"><div className="t">{t}</div>{hint && <div className="hint">{hint}</div>}</div>
      <div className="ctl">{ctl}</div>
    </div>
  )
}

function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  const arr = React.Children.toArray(children).filter(Boolean)
  if (arr.length === 0) return null
  return (
    <div className="set-section">
      <h2><Icon name={icon} />{title}</h2>
      <div className="card set-list">{arr}</div>
    </div>
  )
}

export default function Settings() {
  const app = useApp()
  const s = app.settings
  const [q, setQ] = useState('')
  const [desktop, setDesktop] = useState<SystemInfo | null>(null)
  const [javas, setJavas] = useState<JavaInfo[]>([])
  const [coreErr, setCoreErr] = useState<string | null>(null)
  const [msId, setMsId] = useState('')
  const desktopMode = isDesktop()

  const refreshCore = () => {
    if (!desktopMode) return
    getSystemInfo().then(setDesktop).catch(e => setCoreErr(String(e)))
    listJava().then(setJavas).catch(e => setCoreErr(String(e)))
    getMsClientId().then(setMsId).catch(() => {})
  }
  useEffect(() => {
    refreshCore()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div>
      <div className="page-head">
        <h1>设置</h1>
        <span className="spacer" />
        <span className="search-wrap">
          <Icon name="search" />
          <input className="input" style={{ width: 220 }} placeholder="搜索设置项…" value={q} onChange={e => setQ(e.target.value)} />
        </span>
      </div>

      <Section title="外观" icon="palette">
        <Row q={q} t="主题模式" hint="深色模式使用炭绿底色，壁纸会自动压暗" ctl={
          <div className="segmented">
            <button className={s.theme === 'light' ? 'active' : ''} onClick={() => app.setSettings({ theme: 'light' })}><Icon name="sun" />浅色</button>
            <button className={s.theme === 'dark' ? 'active' : ''} onClick={() => app.setSettings({ theme: 'dark' })}><Icon name="moon" />深色</button>
            <button className={s.theme === 'system' ? 'active' : ''} onClick={() => app.setSettings({ theme: 'system' })}><Icon name="monitor" />系统</button>
          </div>
        } />
        <Row q={q} t="主题色" hint="全部免费开放；语义色（成功/警告/错误）保持不变" ctl={
          <div className="swatches">
            {ACCENTS.map(a => (
              <button key={a.key} className={`swatch ${s.accent === a.key ? 'active' : ''}`} style={{ background: a.l }}
                title={a.label} aria-label={`主题色：${a.label}`} onClick={() => app.setSettings({ accent: a.key })} />
            ))}
          </div>
        } />
        <Row q={q} t="壁纸" hint="在内容区底层铺设像素柚园场景（演示壁纸）" ctl={<Toggle checked={s.wallpaper} onChange={v => app.setSettings({ wallpaper: v })} label="壁纸" />} />
        <Row q={q} t="界面动效" hint="关闭后所有过渡与动画立即降级，跟随系统「减少动效」设置" ctl={<Toggle checked={s.motion} onChange={v => app.setSettings({ motion: v })} label="界面动效" />} />
        <Row q={q} t="字号缩放" hint="85% – 115%" ctl={
          <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input type="range" min={85} max={115} step={5} value={s.fontScale} onChange={e => app.setSettings({ fontScale: Number(e.target.value) })} style={{ width: 130 }} />
            <span className="num small" style={{ width: 42 }}>{s.fontScale}%</span>
          </span>
        } />
      </Section>

      <Section title="启动" icon="play">
        <Row q={q} t="启动器可见性" hint="「启动后退出」最省内存；崩溃捕获需要启动器保持运行" ctl={
          <Select ariaLabel="启动器可见性" width={190} value={s.visibility} onChange={v => app.setSettings({ visibility: v })} options={[
            { value: 'hide', label: '启动后隐藏到托盘' },
            { value: 'exit', label: '启动后退出启动器' },
            { value: 'keep', label: '保持可见' },
            { value: 'reopen', label: '游戏结束后重开' },
          ]} />
        } />
        <Row q={q} t="默认内存分配" hint="新实例的默认值；实例设置可单独覆盖" ctl={
          <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input type="range" min={1024} max={16384} step={512} value={s.memory} onChange={e => app.setSettings({ memory: Number(e.target.value) })} style={{ width: 130 }} />
            <span className="num small" style={{ width: 48 }}>{s.memory / 1024} GB</span>
          </span>
        } />
        <Row q={q} t="启动前检查（Pre-flight）" hint="Java / 内存 / 前置模组 / 资产完整性 / 账户令牌，问题前置拦截" ctl={<Toggle checked={s.preflight} onChange={v => app.setSettings({ preflight: v })} label="启动前检查" />} />
      </Section>

      <Section title="下载" icon="download">
        <Row q={q} t="下载源" hint="国内默认 BMCLAPI 镜像优先，失效自动回退 Mojang 官方" ctl={
          <Select ariaLabel="下载源" width={210} value={s.source} onChange={v => app.setSettings({ source: v })} options={[
            { value: 'bmclapi', label: 'BMCLAPI 优先（推荐）' },
            { value: 'official', label: '仅 Mojang 官方' },
            { value: 'custom', label: '自定义镜像…' },
          ]} />
        } />
        <Row q={q} t="并发任务数" hint="任务级并发；单文件内部另有分片并发" ctl={
          <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input type="range" min={1} max={64} value={s.concurrency} onChange={e => app.setSettings({ concurrency: Number(e.target.value) })} style={{ width: 130 }} />
            <span className="num small" style={{ width: 28 }}>{s.concurrency}</span>
          </span>
        } />
        <Row q={q} t="网络代理" hint="微软登录在国内网络不稳时，可尝试手动代理" ctl={
          <Select ariaLabel="网络代理" width={200} value={s.proxy} onChange={v => app.setSettings({ proxy: v })} options={[
            { value: 'system', label: '跟随系统代理' },
            { value: 'direct', label: '直连' },
            { value: 'manual', label: '手动 HTTP / SOCKS5…' },
          ]} />
        } />
      </Section>

      <Section title="隐私与安全" icon="shield">
        <Row q={q} t="使用情况统计" hint="默认关闭。DEMO 不发送任何网络请求；正式版 opt-in 且内容可审阅" ctl={<Toggle checked={s.telemetry} onChange={v => { app.setSettings({ telemetry: v }); app.toast(v ? '已开启统计（演示：不会真的发送）' : '已关闭统计', 'info') }} label="使用情况统计" />} />
        <Row q={q} t="崩溃报告自动脱敏" hint="导出求助包时打码用户名 / 本机路径 / 令牌 / 服务器 IP" ctl={<Toggle checked={s.redact} onChange={v => app.setSettings({ redact: v })} label="崩溃报告自动脱敏" />} />
        <Row q={q} t="数据目录" hint="便携模式：在程序目录放置 portable.flag 即可整体随身携带" ctl={
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="mono small muted">%APPDATA%/PomeloLauncher</span>
            <button className="btn ghost sm" onClick={() => app.toast('已打开数据目录（演示）')}><Icon name="folder" size={13} />打开</button>
          </span>
        } />
      </Section>

      {matchQ(q, '桌面核心 运行模式 数据目录 Java 版本 刷新', 'desktop core rust') && (
        <div className="set-section">
          <h2><Icon name="cpu" />桌面核心</h2>
          <div className="card set-list">
            <div className="set-row">
              <div className="txt">
                <div className="t">运行模式</div>
                <div className="hint">{desktop ? '与 Rust 核心（pomelo-core）IPC 连接，实例与下载由本机处理' : '浏览器演示模式：数据为 mock；桌面版由 Rust 核心接管'}</div>
              </div>
              <div className="ctl">
                {desktop ? <span className="chip success">桌面版已连接</span> : <span className="chip outline">演示模式</span>}
              </div>
            </div>
            {desktop && (
              <>
                <div className="set-row">
                  <div className="txt"><div className="t">核心版本 / 平台</div><div className="hint">pomelo-core 0.1.0</div></div>
                  <div className="ctl"><span className="chip outline num">{desktop.app_version} · {desktop.platform}</span></div>
                </div>
                <div className="set-row">
                  <div className="txt"><div className="t">数据目录</div><div className="hint">实例、版本、日志与账户文件</div></div>
                  <div className="ctl">
                    <span className="mono small muted" style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={desktop.data_root}>{desktop.data_root}</span>
                    <button className="btn ghost sm" onClick={() => openDataDir().then(() => app.toast('已打开数据目录', 'success')).catch(() => app.toast('打开失败', 'danger'))}><Icon name="folder" size={13} />打开</button>
                  </div>
                </div>
                <div className="set-row" style={{ alignItems: 'flex-start' }}>
                  <div className="txt"><div className="t">Java 运行时</div><div className="hint">按 MC 版本自动匹配；启动前检查会再次验证</div></div>
                  <div className="ctl" style={{ flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                    {javas.length === 0
                      ? <span className="muted small">未检测到 Java</span>
                      : javas.slice(0, 3).map(j => (
                        <span key={j.path} className="small num" title={j.path}>Java {j.major} · {j.full_version}</span>
                      ))}
                    <button className="btn quiet sm" onClick={refreshCore}><Icon name="refresh" size={13} />重新扫描</button>
                  </div>
                </div>
                <div className="set-row">
                  <div className="txt"><div className="t">Microsoft 客户端 ID</div><div className="hint">设备码登录所需的 Azure 应用 ID（需启用公共客户端流）；留空则登录入口引导填写</div></div>
                  <div className="ctl">
                    <input className="input mono" style={{ width: 260 }} value={msId} onChange={e => setMsId(e.target.value)} placeholder="未配置" />
                    <button className="btn ghost sm" onClick={() => setMsClientId(msId.trim()).then(() => app.toast('客户端 ID 已保存', 'success')).catch(e => app.toast(String(e), 'danger'))}>保存</button>
                  </div>
                </div>
              </>
            )}
            {!desktop && (
              <div className="set-row">
                <div className="txt"><div className="t">启动桌面版</div><div className="hint">cd src-tauri/app && cargo tauri dev（Windows 需 MSVC 工具链）</div></div>
                <div className="ctl"><span className="chip">仅桌面端可用</span></div>
              </div>
            )}
            {coreErr && (
              <div className="set-row">
                <div className="txt"><div className="t">核心连接异常</div><div className="hint" style={{ color: 'var(--danger)' }}>{coreErr}</div></div>
              </div>
            )}
          </div>
        </div>
      )}

      {matchQ(q, '关于 版本 更新 许可 向导', 'PomeloLauncher Apache') && (
        <div className="set-section">
          <h2><Icon name="info" />关于</h2>
          <div className="card about-box">
            <div className="logo-big"><Logo size={56} /></div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>PomeloLauncher <span className="muted small num">v0.1.0-demo</span></div>
              <div className="muted small">柚子启动器 · 剥开即玩 · Apache-2.0 开源</div>
              <div className="links">
                <button className="btn quiet sm" onClick={() => app.toast('正式版将链接到 GitHub 仓库')}><Icon name="external" size={13} />GitHub</button>
                <button className="btn quiet sm" onClick={() => app.toast('正式版将链接到文档站')}><Icon name="book" size={13} />文档</button>
                <button className="btn quiet sm" onClick={() => app.toast('企划书见仓库 docs/项目企划书.md')}><Icon name="file" size={13} />企划书</button>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button className="btn soft sm" onClick={() => app.toast('已是最新版本（演示）', 'success')}><Icon name="refresh" size={13} />检查更新</button>
              <button className="btn ghost sm" onClick={app.openWizard}><Icon name="zap" size={13} />重看欢迎向导</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
