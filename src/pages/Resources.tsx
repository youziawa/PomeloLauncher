/* 资源中心：Modrinth 站内搜索（mock）+ 依赖解析安装 */
import React, { useState } from 'react'
import { useApp } from '../store'
import { Icon, Empty, ResourceIcon } from '../ui'
import { resourceCatalog, ResCategory } from '../mock'

const CATS: { key: 'all' | ResCategory; label: string; icon: string }[] = [
  { key: 'all', label: '全部', icon: 'grid' },
  { key: 'mod', label: '模组', icon: 'package' },
  { key: 'resourcepack', label: '资源包', icon: 'image' },
  { key: 'shader', label: '光影', icon: 'sun' },
  { key: 'modpack', label: '整合包', icon: 'layers' },
  { key: 'world', label: '世界', icon: 'globe' },
]

export default function Resources() {
  const app = useApp()
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<'all' | ResCategory>('all')
  const list = resourceCatalog.filter(r =>
    (cat === 'all' || r.category === cat) &&
    (q === '' || r.name.toLowerCase().includes(q.toLowerCase()) || r.zhName.includes(q))
  )
  return (
    <div>
      <div className="page-head">
        <h1>资源中心</h1>
        <span className="chip primary"><Icon name="globe" size={12} />Modrinth</span>
        <span className="chip outline" title="正式版 M2 接入，需官方 API key">CurseForge · 即将接入</span>
        <span className="spacer" />
        <span className="search-wrap">
          <Icon name="search" />
          <input className="input" style={{ width: 260 }} placeholder="双语搜索：钠 / Sodium…" value={q} onChange={e => setQ(e.target.value)} />
        </span>
      </div>
      <div className="tabs" style={{ marginBottom: 14 }}>
        {CATS.map(c => (
          <button key={c.key} className={`tab ${cat === c.key ? 'active' : ''}`} onClick={() => setCat(c.key)}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name={c.icon} size={14} />{c.label}</span>
          </button>
        ))}
      </div>
      {list.length === 0 ? (
        <div className="card">
          <Empty icon="search" title={`没有找到与「${q}」相关的资源`} hint="试试英文名、中文名，或切换分类；正式版将同时搜索 Modrinth 与 CurseForge"
            action={<button className="btn soft sm" onClick={() => { setQ(''); setCat('all') }}>清除搜索</button>} />
        </div>
      ) : (
        <div className="res-list">
          {list.map(r => {
            const installed = app.installedIds.includes(r.id)
            return (
              <div key={r.id} className="card res-item">
                <ResourceIcon slug={r.slug} tone={r.tone} category={r.category} />
                <div className="info">
                  <div className="name">{r.zhName}<span className="en">{r.name}</span></div>
                  <div className="desc">{r.desc}</div>
                  <div className="meta">
                    <span className="num"><Icon name="download" size={12} /> {r.downloads}</span>
                    {r.versions.slice(0, 3).map(v => <span key={v} className="chip outline num">{v}</span>)}
                    {r.loader && <span className="chip">{r.loader}</span>}
                    {r.deps && <span className="chip accent">需要前置</span>}
                  </div>
                </div>
                <div className="side">
                  {installed ? (
                    <span className="chip success"><Icon name="check" size={12} />已加入队列</span>
                  ) : (
                    <button className="btn soft sm" onClick={() => app.openModal({ type: 'install', res: r })}>
                      <Icon name="download" size={13} />安装
                    </button>
                  )}
                  <button className="btn quiet sm" onClick={() => app.toast('已打开 Modrinth 页面（演示）')}><Icon name="external" size={13} />详情</button>
                </div>
              </div>
            )
          })}
        </div>
      )}
      <p className="muted small" style={{ marginTop: 14 }}>
        演示数据为合成内容。正式版：Modrinth 开放 API（M1）+ CurseForge 官方 API（M2），中文译名来自 MCMod 缓存与社区贡献。
      </p>
    </div>
  )
}
