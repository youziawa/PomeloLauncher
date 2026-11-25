/* 实例页：列表 + 详情（模组/资源包/光影/存档/服务器/截图/日志/设置） */
import React, { useEffect, useRef, useState } from 'react'
import { useApp } from '../store'
import { Icon, InstanceIcon, LoaderChip, TagDot, Toggle, Empty, PingChip, PixelShot, Select, ResourceIcon } from '../ui'
import { TAG_COLORS, TagColor } from '../mock'

export default function Instances() {
  const app = useApp()
  if (app.detailId) return <Detail id={app.detailId} />
  return <List />
}

function List() {
  const app = useApp()
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<'all' | 'fav' | TagColor>('all')
  const [sort, setSort] = useState('recent')

  let list = app.instances.filter(i =>
    (filter === 'all' || (filter === 'fav' ? i.favorite : i.tag === filter)) &&
    (q === '' || i.name.toLowerCase().includes(q.toLowerCase()) || i.mcVersion.includes(q))
  )
  if (sort === 'name') list = [...list].sort((a, b) => a.name.localeCompare(b.name, 'zh'))
  if (sort === 'mods') list = [...list].sort((a, b) => b.modsCount - a.modsCount)

  const tags = Object.keys(TAG_COLORS) as TagColor[]
  return (
    <div>
      <div className="page-head">
        <h1>实例</h1>
        <span className="muted small num">{app.instances.length} 个实例 · 版本隔离默认开启</span>
        <span className="spacer" />
        <button className="btn primary" onClick={() => app.openModal({ type: 'new-instance' })}><Icon name="plus" />新建实例</button>
      </div>
      <div className="toolbar">
        <span className="search-wrap">
          <Icon name="search" />
          <input className="input" style={{ width: 220 }} placeholder="搜索实例或版本…" value={q} onChange={e => setQ(e.target.value)} />
        </span>
        <div className="filter-chips">
          <button className={`filter-chip ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>全部</button>
          <button className={`filter-chip ${filter === 'fav' ? 'active' : ''}`} onClick={() => setFilter('fav')}>★ 收藏</button>
          {tags.map(t => (
            <button key={t} className={`filter-chip ${filter === t ? 'active' : ''}`} onClick={() => setFilter(t)} title={`颜色标签：${t}`}>
              <span className="tag-dot" style={{ background: TAG_COLORS[t], display: 'inline-block', marginRight: 5, marginTop: 0 }} />{t}
            </button>
          ))}
        </div>
        <span className="grow" />
        <Select ariaLabel="排序" width={130} value={sort} onChange={setSort} options={[
          { value: 'recent', label: '最近游玩' },
          { value: 'name', label: '名称' },
          { value: 'mods', label: '模组数量' },
        ]} />
      </div>
      {list.length === 0 ? (
        <div className="card"><Empty icon="grid" title="没有匹配的实例" hint="换个关键词，或清除筛选条件试试" action={<button className="btn soft sm" onClick={() => { setQ(''); setFilter('all') }}>清除筛选</button>} /></div>
      ) : (
        <div className="inst-grid">
          {list.map(i => (
            <div key={i.id} className="card inst-tile" onClick={() => app.openDetail(i.id)} role="button" tabIndex={0}
              onKeyDown={e => { if (e.key === 'Enter') app.openDetail(i.id) }}>
              <div className="top">
                <InstanceIcon kind={i.icon} size="sm" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="name">{i.name}</div>
                  <div className="muted small num">{i.mcVersion}</div>
                </div>
                <TagDot tag={i.tag} />
                <button className={`iconbtn ${i.favorite ? 'on' : ''}`} aria-label="收藏"
                  onClick={e => { e.stopPropagation(); app.toggleFavorite(i.id) }}>
                  <Icon name="star" />
                </button>
              </div>
              <div className="chips">
                <LoaderChip loader={i.loader} version={i.loaderVersion} />
                {i.modsCount > 0 && <span className="chip num">{i.modsCount} 模组</span>}
                {i.installed === false && <span className="chip accent">待安装</span>}
                {i.crashDemo && <span className="chip danger">崩溃演示</span>}
              </div>
              <div className="facts">
                <span>{i.lastPlayed}</span>
                <span className="num">{i.playTime}</span>
              </div>
              <div className="actions">
                {i.installed === false ? (
                  <button className="btn soft sm" onClick={e => { e.stopPropagation(); app.installGame(i.id) }}><Icon name="download" size={13} />安装</button>
                ) : (
                  <button className="btn soft sm" onClick={e => { e.stopPropagation(); app.startLaunch(i.id) }}><Icon name="play" size={13} />启动</button>
                )}
                <button className="btn ghost sm" onClick={e => { e.stopPropagation(); app.openDetail(i.id) }}>详情</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const TABS = ['模组', '资源包', '光影', '存档', '服务器', '截图', '日志', '设置'] as const
type Tab = typeof TABS[number]

function Detail({ id }: { id: string }) {
  const app = useApp()
  const inst = app.instances.find(i => i.id === id)
  const [tab, setTab] = useState<Tab>('模组')
  if (!inst) return <Empty title="实例不存在" action={<button className="btn soft" onClick={() => app.openDetail(null)}>返回列表</button>} />
  const mods = app.mods[id] ?? []
  const packs = app.packs[id] ?? { resourcepacks: [], shaders: [] }

  return (
    <div>
      <div className="detail-head">
        <button className="iconbtn" onClick={() => app.openDetail(null)} aria-label="返回实例列表"><Icon name="chevron-left" /></button>
        <InstanceIcon kind={inst.icon} size="sm" />
        <div>
          <div className="name">{inst.name}</div>
          <div className="chips">
            <span className="chip outline num">{inst.mcVersion}</span>
            <LoaderChip loader={inst.loader} version={inst.loaderVersion} />
            <span className="chip">{inst.java}</span>
          </div>
        </div>
        <span className="spacer" />
        <button className="btn ghost" onClick={() => app.toast(`已打开目录：instances/${id}/.minecraft（演示）`)}><Icon name="folder" />打开目录</button>
        {inst.installed === false && (
          <button className="btn primary" onClick={() => app.installGame(id)}><Icon name="download" />安装游戏文件</button>
        )}
        <button className="btn primary" disabled={inst.installed === false} onClick={() => app.startLaunch(id)}><Icon name="play" />启动</button>
      </div>
      <div className="tabs" role="tablist">
        {TABS.map(t => (
          <button key={t} role="tab" aria-selected={tab === t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {t}{t === '模组' && mods.length > 0 ? ` ${mods.length}` : ''}
          </button>
        ))}
      </div>
      <div style={{ paddingTop: 14 }}>
        {tab === '模组' && <ModsTab id={id} />}
        {tab === '资源包' && <PacksTab id={id} kind="resourcepacks" items={packs.resourcepacks} />}
        {tab === '光影' && <PacksTab id={id} kind="shaders" items={packs.shaders} />}
        {tab === '存档' && <SavesTab id={id} />}
        {tab === '服务器' && <ServersTab id={id} />}
        {tab === '截图' && <ShotsTab />}
        {tab === '日志' && <LogsTab id={id} />}
        {tab === '设置' && <InstSettings id={id} />}
      </div>
    </div>
  )
}

function ModsTab({ id }: { id: string }) {
  const app = useApp()
  const [q, setQ] = useState('')
  const mods = (app.mods[id] ?? []).filter(m => q === '' || m.name.toLowerCase().includes(q.toLowerCase()) || m.zhName.includes(q))
  const enabled = (app.mods[id] ?? []).filter(m => m.enabled).length
  return (
    <div>
      <div className="toolbar">
        <span className="muted small num">{enabled} / {app.mods[id]?.length ?? 0} 已启用</span>
        <span className="search-wrap">
          <Icon name="search" />
          <input className="input" style={{ width: 200 }} placeholder="搜索模组…" value={q} onChange={e => setQ(e.target.value)} />
        </span>
        <span className="grow" />
        <button className="btn quiet sm" onClick={() => app.setAllMods(id, true)}>全部启用</button>
        <button className="btn quiet sm" onClick={() => app.setAllMods(id, false)}>全部禁用</button>
        <button className="btn soft sm" onClick={() => app.checkUpdates(id)}><Icon name="refresh" size={14} />检查更新</button>
      </div>
      <div className="card list-card">
        {mods.length === 0 ? (
          <Empty icon="package" title={q ? '没有匹配的模组' : '这个实例还没有模组'} hint={q ? '试试英文名或中文名' : '去资源中心搜索并安装，或直接把 .jar 拖进窗口'} action={!q ? <button className="btn soft sm" onClick={() => app.go('resources')}>去资源中心</button> : undefined} />
        ) : mods.map(m => (
          <div key={m.id} className={`row ${m.enabled ? '' : 'mod-off'}`}>
            <Toggle checked={m.enabled} onChange={() => app.toggleMod(id, m.id)} label={`启用 ${m.zhName}`} />
            <ResourceIcon slug={m.slug} tone="#7BA23F" category="mod" size={30} />
            <div className="grow">
              <div className="mod-name"><span className="title">{m.zhName}</span><span className="en">{m.name}</span>{m.culprit && <span className="chip danger">肇事模组</span>}</div>
              <div className="sub num">{m.version} · {m.sizeMB} MB</div>
            </div>
            {m.update && <span className="chip accent num">可更新 {m.update}</span>}
            {m.update && <button className="btn soft sm" onClick={() => app.updateMod(id, m.id)}><Icon name="download" size={13} />更新</button>}
          </div>
        ))}
      </div>
    </div>
  )
}

function PacksTab({ id, kind, items }: { id: string; kind: 'resourcepacks' | 'shaders'; items: { id: string; name: string; zhName: string; enabled: boolean }[] }) {
  const app = useApp()
  return (
    <div>
      <div className="toolbar">
        <span className="muted small">{kind === 'resourcepacks' ? '列表越靠上优先级越高（与游戏内一致）' : '同一时间只能启用一个光影包'}</span>
      </div>
      <div className="card list-card">
        {items.length === 0 ? (
          <Empty icon={kind === 'resourcepacks' ? 'image' : 'sun'} title={kind === 'resourcepacks' ? '还没有资源包' : '还没有光影包'} hint="去资源中心下载，支持拖拽安装" action={<button className="btn soft sm" onClick={() => app.go('resources')}>去资源中心</button>} />
        ) : items.map((p, idx) => (
          <div key={p.id} className={`row ${p.enabled ? '' : 'mod-off'}`}>
            <Toggle checked={p.enabled} onChange={() => app.togglePack(id, kind, p.id)} label={`启用 ${p.zhName}`} />
            <div className="grow">
              <div className="title">{p.zhName}</div>
              <div className="sub">{p.name}</div>
            </div>
            {kind === 'resourcepacks' && (
              <>
                <button className="iconbtn" disabled={idx === 0} onClick={() => app.movePack(id, kind, p.id, -1)} aria-label="上移"><Icon name="arrow-up" /></button>
                <button className="iconbtn" disabled={idx === items.length - 1} onClick={() => app.movePack(id, kind, p.id, 1)} aria-label="下移"><Icon name="arrow-down" /></button>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function SavesTab({ id }: { id: string }) {
  const app = useApp()
  const saves = app.saves[id] ?? []
  return (
    <div className="card list-card">
      {saves.length === 0 ? (
        <Empty icon="folder" title="还没有存档" hint="启动游戏并创建世界后，这里会显示你的存档" />
      ) : saves.map(s => (
        <div key={s.id} className="row">
          <Icon name="folder" className="muted" />
          <div className="grow">
            <div className="title">{s.name}</div>
            <div className="sub num">{s.mode} · {s.version} · {s.sizeMB} MB · 最后游玩 {s.lastPlayed}</div>
          </div>
          <button className="btn ghost sm" onClick={() => app.toast(`存档「${s.name}」已备份到 backups/（演示）`, 'success')}><Icon name="copy" size={13} />备份</button>
          <button className="btn quiet sm" onClick={() => app.toast('已导出存档 zip（演示）', 'success')}><Icon name="external" size={13} />导出</button>
        </div>
      ))}
    </div>
  )
}

function ServersTab({ id }: { id: string }) {
  const app = useApp()
  const servers = app.servers[id] ?? []
  const [name, setName] = useState('')
  const [addr, setAddr] = useState('')
  return (
    <div>
      <div className="card list-card" style={{ marginBottom: 12 }}>
        {servers.length === 0 ? (
          <Empty icon="server" title="还没有服务器" hint="添加服务器后可查看延迟与在线人数，一键加入" />
        ) : servers.map(s => (
          <div key={s.id} className="row">
            <Icon name="server" className="muted" />
            <div className="grow">
              <div className="title">{s.name}</div>
              <div className="sub mono">{s.address}</div>
            </div>
            <PingChip ping={s.ping} />
            <span className="chip num">{s.online.toLocaleString()} / {s.max.toLocaleString()} 在线</span>
            <button className="btn soft sm" onClick={() => app.toast(`正在加入「${s.name}」…（演示）`, 'success')}><Icon name="play" size={13} />加入</button>
            <button className="iconbtn danger" onClick={() => app.removeServer(id, s.id)} aria-label="删除服务器"><Icon name="trash" /></button>
          </div>
        ))}
      </div>
      <div className="card pad">
        <h4 style={{ marginBottom: 10 }}>添加服务器</h4>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input className="input" placeholder="服务器名称" value={name} onChange={e => setName(e.target.value)} style={{ width: 180 }} />
          <input className="input" placeholder="地址，如 mc.example.com" value={addr} onChange={e => setAddr(e.target.value)} style={{ flex: 1, minWidth: 200 }} />
          <button className="btn primary" disabled={!name || !addr} onClick={() => { app.addServer(id, name, addr); setName(''); setAddr('') }}><Icon name="plus" />添加</button>
        </div>
      </div>
    </div>
  )
}

function ShotsTab() {
  const app = useApp()
  const shots = [
    { v: 0, cap: '2026-11-24_21.30.12.png' },
    { v: 1, cap: '2026-11-24_21.31.40.png' },
    { v: 2, cap: '2026-11-23_22.05.11.png' },
    { v: 3, cap: '2026-11-20_19.44.02.png' },
  ]
  return (
    <div>
      <div className="toolbar">
        <span className="muted small">截图保存在实例的 screenshots/ 目录（演示图为合成像素场景）</span>
        <span className="grow" />
        <button className="btn ghost sm" onClick={() => app.toast('已打开 screenshots/ 目录（演示）')}><Icon name="folder" size={14} />打开目录</button>
      </div>
      <div className="screenshot-grid">
        {shots.map(s => (
          <button key={s.cap} className="shot" onClick={() => app.toast('已复制截图到剪贴板（演示）', 'success')}>
            <PixelShot variant={s.v} />
            <span className="cap mono">{s.cap}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function LogsTab({ id }: { id: string }) {
  const app = useApp()
  const logs = app.logsFor(id)
  const ref = useRef<HTMLDivElement>(null)
  const [auto, setAuto] = useState(true)
  useEffect(() => { if (auto && ref.current) ref.current.scrollTop = ref.current.scrollHeight }, [logs.length, auto])
  return (
    <div>
      <div className="toolbar">
        <span className="muted small num">{logs.length} 行 · latest.log（演示数据）</span>
        <span className="grow" />
        <label className="small" style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <Toggle checked={auto} onChange={setAuto} label="自动滚动" />自动滚动
        </label>
        <button className="btn ghost sm" onClick={() => { navigator.clipboard?.writeText(logs.map(l => `[${l.t}] [${l.level}] ${l.text}`).join('\n')); app.toast('日志已复制到剪贴板', 'success') }}><Icon name="copy" size={13} />复制</button>
      </div>
      <div className="logview" ref={ref}>
        {logs.map((l, i) => (
          <div key={i} className={`logline ${l.level}`}>
            <span className="t">[{l.t}]</span> <span className="lv">[{l.level}]</span> {l.text}
          </div>
        ))}
      </div>
    </div>
  )
}

function InstSettings({ id }: { id: string }) {
  const app = useApp()
  const inst = app.instances.find(i => i.id === id)!
  const servers = app.servers[id] ?? []
  const [win, setWin] = useState('854×480（默认）')
  return (
    <div className="card pad settings-form">
      <div className="field">
        <label>内存分配：<span className="num">{inst.memoryMB / 1024} GB</span></label>
        <input type="range" min={1024} max={16384} step={512} value={inst.memoryMB}
          onChange={e => app.updateInstance(id, { memoryMB: Number(e.target.value) })} />
        <span className="hint">自动分配已根据系统内存与模组数量给出建议值，可手动覆盖</span>
      </div>
      <div className="field">
        <label>Java 运行时</label>
        <Select ariaLabel="Java 运行时" width={220} value={inst.java} onChange={v => app.updateInstance(id, { java: v })} options={[
          { value: 'Java 21（自动）', label: 'Java 21（自动）' },
          { value: 'Java 17（自动）', label: 'Java 17（自动）' },
          { value: 'Java 8（自动）', label: 'Java 8（自动）' },
          { value: '手动选择…（演示）', label: '手动选择…（演示）' },
        ]} />
        <span className="hint">按游戏版本自动匹配；手动覆盖不兼容版本时会在启动前检查中警告</span>
      </div>
      <div className="field-inline">
        <div className="txt">
          <div className="t" style={{ fontWeight: 600 }}>版本隔离</div>
          <div className="hint">每个实例独立 mods / config / saves，互不干扰</div>
        </div>
        <Toggle checked={inst.isolation} onChange={v => app.updateInstance(id, { isolation: v })} label="版本隔离" />
      </div>
      <div className="field">
        <label>启动后自动加入服务器</label>
        <Select ariaLabel="启动后自动加入服务器" width={280} value={inst.autoServer ?? ''} onChange={v => app.updateInstance(id, { autoServer: v || undefined })} options={[
          { value: '', label: '不自动加入' },
          ...servers.map(s => ({ value: s.id, label: `${s.name}（${s.address}）` })),
        ]} />
      </div>
      <div className="field">
        <label>游戏窗口</label>
        <Select ariaLabel="游戏窗口" width={200} value={win} onChange={setWin} options={[
          { value: '854×480（默认）', label: '854×480（默认）' },
          { value: '1280×720', label: '1280×720' },
          { value: '1920×1080', label: '1920×1080' },
          { value: '全屏', label: '全屏' },
        ]} />
      </div>
    </div>
  )
}
