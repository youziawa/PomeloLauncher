/* 账户页 + 添加账户向导（微软设备码 / 离线 / authlib-injector 皮肤站） */
import React, { useEffect, useState } from 'react'
import { useApp } from '../store'
import { Icon, SkinHead, Modal, PlayerHead } from '../ui'
import { uid } from '../mock'

export default function Accounts() {
  const app = useApp()
  return (
    <div>
      <div className="page-head">
        <h1>账户</h1>
        <span className="muted small">令牌保存在系统密钥环，不落明文（演示为本地状态）</span>
        <span className="spacer" />
        <button className="btn primary" onClick={() => app.openModal({ type: 'add-account' })}><Icon name="plus" />添加账户</button>
      </div>
      <div className="acc-grid">
        {app.accounts.map(a => (
          <div key={a.id} className="card acc-tile">
            <PlayerHead name={a.kind === 'microsoft' ? a.name : undefined} skin={a.skin} />
            <div className="who">
              <div className="name">
                {a.name}
                {app.currentAccId === a.id && <span className="chip primary">当前</span>}
              </div>
              <div style={{ margin: '5px 0' }}>
                {a.kind === 'microsoft' && <span className="chip info">Microsoft 正版</span>}
                {a.kind === 'offline' && <span className="chip outline">离线账户</span>}
                {a.kind === 'authlib' && <span className="chip primary">{a.server} · 外置登录</span>}
              </div>
              <div className="ops">
                <button className="btn soft sm" disabled={app.currentAccId === a.id} onClick={() => { app.setCurrentAccId(a.id); app.toast(`已切换到「${a.name}」`, 'success') }}>设为当前</button>
                <button className="iconbtn danger" onClick={() => app.removeAccount(a.id)} aria-label="删除账户"><Icon name="trash" /></button>
              </div>
            </div>
          </div>
        ))}
        <button className="card acc-tile" style={{ cursor: 'pointer', borderStyle: 'dashed', justifyContent: 'center', color: 'var(--muted)', minHeight: 110 }}
          onClick={() => app.openModal({ type: 'add-account' })}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Icon name="plus" />添加账户</span>
        </button>
      </div>
      <p className="muted small" style={{ marginTop: 16 }}>
        离线账户可本地游玩，但无法进入启用正版验证的服务器。
        <a href="https://www.minecraft.net/zh-hans/store/minecraft-java-bedrock-edition-pc" target="_blank" rel="noreferrer"> 购买正版 Minecraft</a>
      </p>
    </div>
  )
}

/* 确定性伪随机 QR（演示图形，非真实二维码） */
function FakeQR() {
  const cells: React.ReactNode[] = []
  let seed = 42
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 }
  const n = 21, s = 6
  const finder = (x: number, y: number) => (
    <g key={`f${x}${y}`}>
      <rect x={x * s} y={y * s} width={7 * s} height={7 * s} fill="var(--text)" />
      <rect x={(x + 1) * s} y={(y + 1) * s} width={5 * s} height={5 * s} fill="var(--surface)" />
      <rect x={(x + 2) * s} y={(y + 2) * s} width={3 * s} height={3 * s} fill="var(--text)" />
    </g>
  )
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const inFinder = (x < 8 && y < 8) || (x > n - 9 && y < 8) || (x < 8 && y > n - 9)
    if (!inFinder && rnd() > 0.55) cells.push(<rect key={`${x}-${y}`} x={x * s} y={y * s} width={s} height={s} fill="var(--text)" />)
  }
  return (
    <svg className="qr" viewBox={`0 0 ${n * s} ${n * s}`} role="img" aria-label="演示二维码图形">
      <rect width={n * s} height={n * s} fill="var(--surface)" />
      {cells}{finder(0, 0)}{finder(n - 7, 0)}{finder(0, n - 7)}
    </svg>
  )
}

export function AddAccountModal() {
  const app = useApp()
  const [tab, setTab] = useState<'ms' | 'offline' | 'authlib'>('ms')
  const [msStep, setMsStep] = useState(0)
  const [authorizing, setAuthorizing] = useState(false)
  const [nick, setNick] = useState('柚子玩家')
  const [server, setServer] = useState('https://littleskin.cn/api/yggdrasil')
  const [email, setEmail] = useState('')
  const [pwd, setPwd] = useState('')

  useEffect(() => {
    if (!authorizing) return
    const t = setInterval(() => setMsStep(s => {
      if (s >= 3) { clearInterval(t); return s }
      return s + 1
    }), 900)
    return () => clearInterval(t)
  }, [authorizing])

  useEffect(() => {
    if (msStep >= 3) {
      const timer = setTimeout(() => {
        app.addAccount({ id: uid('a'), name: '柚子玩家_正版', kind: 'microsoft', skin: 'steve' })
        app.closeModal()
      }, 600)
      return () => clearTimeout(timer)
    }
  }, [msStep]) // eslint-disable-line react-hooks/exhaustive-deps

  const steps = ['等待授权（手机扫码或输入设备码）', '获取 Xbox Live / Minecraft 令牌', '获取游戏档案（UUID + 皮肤）']

  if (app.desktop) {
    return (
      <Modal title="添加账户" onClose={app.closeModal}>
        <p className="muted small" style={{ marginBottom: 12 }}>
          桌面版当前支持离线账户启动；Microsoft 正版登录与皮肤站将在下个里程碑接入。
        </p>
        <div className="field" style={{ marginBottom: 12 }}>
          <label>游戏昵称</label>
          <input className="input" value={nick} onChange={e => setNick(e.target.value)} maxLength={16} placeholder="3–16 个字符" />
          <span className="hint">离线模式无法进入启用正版验证的服务器；皮肤可本地自定义。</span>
        </div>
        <button className="btn primary block" disabled={nick.trim().length < 3}
          onClick={() => { app.addAccount({ id: uid('a'), name: nick.trim(), kind: 'offline', skin: 'pomelo' }); app.closeModal() }}>
          创建离线账户
        </button>
      </Modal>
    )
  }
  return (
    <Modal title="添加账户" onClose={app.closeModal}>
      <div className="tabs" style={{ marginBottom: 16 }}>
        <button className={`tab ${tab === 'ms' ? 'active' : ''}`} onClick={() => setTab('ms')}>Microsoft 正版</button>
        <button className={`tab ${tab === 'offline' ? 'active' : ''}`} onClick={() => setTab('offline')}>离线账户</button>
        <button className={`tab ${tab === 'authlib' ? 'active' : ''}`} onClick={() => setTab('authlib')}>皮肤站（外置登录）</button>
      </div>

      {tab === 'ms' && (
        <div>
          <p className="muted small" style={{ marginBottom: 12 }}>使用设备码流：在手机或另一台设备上打开 <span className="mono">microsoft.com/link</span> 输入下方代码即可，无需在本机输入密码。</p>
          <div className="device-code">POML-8K2F</div>
          <div style={{ margin: '14px 0' }}><FakeQR /></div>
          <div className="ms-steps">
            {steps.map((s, i) => (
              <div key={s} className={`check ${msStep > i ? 'done' : ''}`}>
                {msStep > i ? <Icon name="check" /> : msStep === i && authorizing ? <span className="spinner" /> : <Icon name="clock" />}
                <span>{s}</span>
              </div>
            ))}
          </div>
          <button className="btn primary block" style={{ marginTop: 16 }} disabled={authorizing}
            onClick={() => setAuthorizing(true)}>
            {authorizing ? (msStep >= 3 ? '登录成功' : '正在授权…') : '模拟扫码授权（演示）'}
          </button>
        </div>
      )}

      {tab === 'offline' && (
        <div>
          <div className="field" style={{ marginBottom: 12 }}>
            <label>游戏昵称</label>
            <input className="input" value={nick} onChange={e => setNick(e.target.value)} maxLength={16} placeholder="3–16 个字符" />
            <span className="hint">离线模式无法进入启用正版验证的服务器；皮肤可本地自定义。</span>
          </div>
          <div className="card pad" style={{ background: 'var(--info-soft)', borderColor: 'transparent', marginBottom: 16 }}>
            <span className="small"><Icon name="info" size={14} /> 喜欢这个游戏？<a href="https://www.minecraft.net/zh-hans/store/minecraft-java-bedrock-edition-pc" target="_blank" rel="noreferrer">购买正版</a> 支持开发者，并解锁多人服务器与官方皮肤。</span>
          </div>
          <button className="btn primary block" disabled={nick.trim().length < 3}
            onClick={() => { app.addAccount({ id: uid('a'), name: nick.trim(), kind: 'offline', skin: 'pomelo' }); app.closeModal() }}>
            创建离线账户
          </button>
        </div>
      )}

      {tab === 'authlib' && (
        <div>
          <div className="filter-chips" style={{ marginBottom: 12 }}>
            <button className={`filter-chip ${server.includes('littleskin') ? 'active' : ''}`} onClick={() => setServer('https://littleskin.cn/api/yggdrasil')}>LittleSkin</button>
            <button className={`filter-chip ${!server.includes('littleskin') ? 'active' : ''}`} onClick={() => setServer('')}>自定义服务器</button>
          </div>
          <div className="field" style={{ marginBottom: 10 }}>
            <label>认证服务器地址（Yggdrasil API）</label>
            <input className="input mono" value={server} onChange={e => setServer(e.target.value)} placeholder="https://…/api/yggdrasil" />
          </div>
          <div className="field" style={{ marginBottom: 10 }}>
            <label>邮箱</label>
            <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" />
          </div>
          <div className="field" style={{ marginBottom: 16 }}>
            <label>密码</label>
            <input className="input" type="password" value={pwd} onChange={e => setPwd(e.target.value)} placeholder="演示：任意输入" />
            <span className="hint">通过 authlib-injector 以独立 javaagent 注入游戏进程，启动器不保存明文密码。</span>
          </div>
          <button className="btn primary block" disabled={!server || !email || !pwd}
            onClick={() => {
              app.addAccount({ id: uid('a'), name: email.split('@')[0], kind: 'authlib', server: server.includes('littleskin') ? 'LittleSkin' : '自定义皮肤站', skin: 'alex' })
              app.closeModal()
            }}>
            登录并添加
          </button>
        </div>
      )}
    </Modal>
  )
}
