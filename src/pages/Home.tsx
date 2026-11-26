/* 首页：启动台布局（桌面模式接真实核心，浏览器模式为演示状态机） */
import React, { useEffect, useState } from 'react'
import { useApp } from '../store'
import { Icon, InstanceIcon, Skin3D, LoaderChip, Empty } from '../ui'
import { PREFLIGHT_CHECKS, TIPS } from '../mock'

export default function Home() {
  const app = useApp()
  const inst = app.instances.find(i => i.id === app.currentId) ?? app.instances[0]
  const acc = app.accounts.find(a => a.id === app.currentAccId) ?? app.accounts[0]
  const L = app.launch
  const [tipIdx, setTipIdx] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTipIdx(i => (i + 1) % TIPS.length), 9000)
    return () => clearInterval(t)
  }, [])

  const cycleInstance = (dir: number) => {
    if (app.instances.length < 2) return
    const idx = app.instances.findIndex(i => i.id === inst.id)
    const next = app.instances[(idx + dir + app.instances.length) % app.instances.length]
    app.setCurrentId(next.id)
  }
  const cycleAccount = (dir: number) => {
    if (app.accounts.length < 2) return
    const idx = app.accounts.findIndex(a => a.id === acc?.id)
    const next = app.accounts[(idx + dir + app.accounts.length) % app.accounts.length]
    app.setCurrentAccId(next.id)
  }

  const activeDls = app.downloads.filter(d => d.status === 'downloading')
  const desktopRunning = app.desktop && app.dLaunch.instanceId === inst?.id
  const phase = app.desktop ? (desktopRunning ? 'running' : 'idle') : L.phase
  const runStart = app.desktop ? app.dLaunch.startedAt : L.runStart
  const runSeconds = phase === 'running' && runStart > 0 ? Math.max(0, Math.floor((Date.now() - runStart) / 1000)) : 0
  const mmss = `${String(Math.floor(runSeconds / 60)).padStart(2, '0')}:${String(runSeconds % 60).padStart(2, '0')}`
  const lastLog = app.desktop
    ? (desktopRunning ? `游戏进程运行中（PID ${app.dLaunch.pid ?? '—'}）· 详细日志见实例「日志」页` : '')
    : (L.logs.length ? L.logs[L.logs.length - 1].text : '')
  const visibilityText: Record<string, string> = {
    hide: '启动后隐藏到托盘', exit: '启动后退出启动器', keep: '保持可见', reopen: '游戏结束后重开',
  }
  const recent = app.instances.filter(i => i.id !== inst?.id).slice(0, 3)

  if (!inst) {
    return (
      <div className="card">
        <Empty
          icon="grid"
          title="还没有实例"
          hint={app.desktop ? '桌面版从真实目录读取实例：新建实例后即可安装并启动' : '新建一个实例开始游戏'}
          action={<button className="btn primary sm" onClick={() => app.openModal({ type: 'new-instance' })}><Icon name="plus" size={14} />新建实例</button>}
        />
      </div>
    )
  }

  return (
    <div className="home">
      <div className="hero-grid">
        {/* 主启动面板 */}
        <section className="card hero-instance">
          <div className="hero-inst-top" onWheel={e => cycleInstance(e.deltaY > 0 ? 1 : -1)} title="滚动滚轮可快速切换实例">
            <InstanceIcon kind={inst.icon} version={inst.mcVersion} size="lg" />
            <div className="meta">
              <div className="name">{inst.name}</div>
              <div className="chips">
                <span className="chip outline num">{inst.mcVersion}</span>
                <LoaderChip loader={inst.loader} version={inst.loaderVersion} />
                {inst.modsCount > 0 && <span className="chip num">{inst.modsCount} 个模组</span>}
                {inst.installed === false && <span className="chip accent">待安装</span>}
              </div>
              <div className="facts">
                <span>上次游玩：{inst.lastPlayed}</span>
                <span className="num">累计 {inst.playTime}</span>
              </div>
              <div className="hero-inst-config">
                <span className="chip outline">{inst.java}</span>
                <span className="chip outline num">内存 {inst.memoryMB / 1024} GB</span>
                <span className="chip outline">{inst.isolation ? '版本隔离' : '全局目录'}</span>
              </div>
            </div>
            <div className="inst-ops">
              <button className="btn ghost sm" onClick={() => app.go('instances')}><Icon name="grid" size={14} />切换</button>
              <button className="btn quiet sm" onClick={() => app.toast(`已打开目录：instances/${inst.id}/.minecraft（演示）`)}><Icon name="folder" size={14} />目录</button>
            </div>
          </div>

          {/* 启动区：常驻卡片底部，状态就地切换 */}
          <div className="hero-launch">
            {phase === 'idle' && inst.installed === false && (
              <button className="btn primary launch-btn" onClick={() => app.installGame(inst.id)}>
                <Icon name="download" />安装游戏文件
              </button>
            )}
            {phase === 'idle' && inst.installed !== false && (
              <button className="btn primary launch-btn" onClick={() => app.startLaunch()}>
                <Icon name="play" />启动游戏
              </button>
            )}
            {!app.desktop && L.phase === 'preflight' && (
              <>
                <button className="btn primary launch-btn" disabled><span className="spinner" />启动前检查…</button>
                <div className="preflight">
                  {PREFLIGHT_CHECKS.map((c, i) => (
                    <div key={c} className={`check ${i < L.checksDone ? 'done' : 'pending'}`}>
                      {i < L.checksDone ? <Icon name="check" /> : i === L.checksDone ? <span className="spinner" /> : <Icon name="clock" />}
                      <span>{c}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
            {!app.desktop && L.phase === 'launching' && (
              <>
                <button className="btn primary launch-btn" disabled><span className="spinner" />正在启动… <span className="num">{Math.floor(L.progress)}%</span></button>
                <div className="progress"><i style={{ width: `${L.progress}%` }} /></div>
                <div className="log-ticker">{lastLog}</div>
              </>
            )}
            {phase === 'running' && (
              <>
                <div className="run-row">
                  <span className="run-pill"><span className="dot" />游戏运行中 <span className="num">{mmss}</span></span>
                  <button className="btn danger-soft launch-btn" onClick={app.stopLaunch}><Icon name="stop" />结束游戏</button>
                </div>
                <div className="log-ticker">{lastLog}</div>
              </>
            )}
            {!app.desktop && L.phase === 'crashed' && (
              <>
                <button className="btn danger launch-btn" onClick={() => app.openModal({ type: 'crash' })}><Icon name="alert" />游戏已崩溃 · 查看诊断</button>
                <button className="btn quiet sm" onClick={app.stopLaunch}>重置启动状态</button>
              </>
            )}
            <div className="launch-sub">
              <Icon name="shield" size={14} />
              <span>
                {inst.installed === false
                  ? '游戏文件未安装 · 安装需由你确认发起'
                  : app.desktop
                    ? `离线账户启动 · ${inst.java} · 内存 ${inst.memoryMB / 1024} GB`
                    : `${visibilityText[app.settings.visibility] ?? '启动后隐藏到托盘'}（设置可改）`}
              </span>
            </div>
          </div>
        </section>

        {/* 账户档案卡 */}
        <aside className="card hero-account">
          <div className="acc-card-head">
            <span>当前账户</span>
            <button className="btn quiet sm" onClick={() => app.go('accounts')}>管理</button>
          </div>
          <div className="acc-skin" onWheel={e => cycleAccount(e.deltaY > 0 ? 1 : -1)} title="滚动滚轮可快速切换账户">
            <Skin3D skin={acc?.skin ?? 'steve'} name={acc?.kind === 'microsoft' ? acc.name : undefined} width={128} height={168} />
          </div>
          <div className="acc-name">{acc?.name ?? '未登录'}</div>
          <div className="acc-kind">
            {acc?.kind === 'microsoft' && <span className="chip info">Microsoft 正版</span>}
            {acc?.kind === 'offline' && <span className="chip outline">{app.desktop ? '离线账户' : '离线账户'}</span>}
            {acc?.kind === 'authlib' && <span className="chip primary">{acc.server} · 外置登录</span>}
          </div>
          <div className="acc-switch">
            <button className="iconbtn" onClick={() => cycleAccount(-1)} aria-label="上一个账户"><Icon name="chevron-left" /></button>
            <button className="btn soft sm" onClick={() => cycleAccount(1)}>切换账户</button>
            <button className="iconbtn" onClick={() => cycleAccount(1)} aria-label="下一个账户"><Icon name="chevron-right" /></button>
          </div>
        </aside>
      </div>

      {/* 最近游玩 */}
      <section className="home-section">
        <div className="section-head">
          <h3>最近游玩</h3>
          <button className="btn quiet sm" onClick={() => app.go('instances')}>全部实例 <Icon name="chevron-right" size={14} /></button>
        </div>
        <div className="recent-row">
          {recent.length === 0 ? (
            <div className="card" style={{ gridColumn: '1 / -1' }}>
              <Empty icon="grid" title="还没有其他实例" hint="新建实例后会出现在这里" action={<button className="btn soft sm" onClick={() => app.openModal({ type: 'new-instance' })}>新建实例</button>} />
            </div>
          ) : recent.map(i => (
            <button key={i.id} className="recent-card" onClick={() => app.setCurrentId(i.id)}>
              <InstanceIcon kind={i.icon} version={i.mcVersion} size="sm" />
              <span className="recent-txt">
                <span className="t">{i.name}</span><br />
                <span className="s num">{i.mcVersion} · {i.lastPlayed}</span>
              </span>
              <Icon name="chevron-right" size={15} className="recent-arrow" />
            </button>
          ))}
        </div>
      </section>

      {/* 下载摘要 + 小贴士 */}
      <div className="home-bottom">
        <section className="card dl-mini">
          <div className="mini-head">
            <h4>下载进行中 {activeDls.length > 0 && <span className="num muted small">（{activeDls.length}）</span>}</h4>
            <button className="btn quiet sm" onClick={() => app.go('downloads')}>打开下载页 <Icon name="chevron-right" size={13} /></button>
          </div>
          {activeDls.length === 0 ? (
            <p className="mini-empty">
              {app.desktop ? '当前没有进行中的下载。安装游戏文件或整合包时，任务会出现在这里。' : '当前没有进行中的下载。安装实例、模组或整合包时，任务会出现在这里。'}
            </p>
          ) : activeDls.slice(0, 2).map(d => (
            <div key={d.id} className="dl-mini-row">
              <span className="nm">{d.name}</span>
              <span className="pg"><span className="progress"><i style={{ width: `${d.progress}%` }} /></span></span>
              <span className="pc num">{Math.floor(d.progress)}%</span>
            </div>
          ))}
        </section>
        <section className="card tip-mini">
          <div className="mini-head"><h4><Icon name="zap" size={14} /> 柚子小贴士</h4></div>
          <p className="tip-text">{TIPS[tipIdx]}</p>
          <div className="tip-links">
            <button className="btn ghost sm" onClick={() => app.go('resources')}><Icon name="package" size={13} />资源中心</button>
            <button className="btn quiet sm" onClick={() => app.go('settings')}><Icon name="palette" size={13} />个性化设置</button>
          </div>
        </section>
      </div>
    </div>
  )
}
