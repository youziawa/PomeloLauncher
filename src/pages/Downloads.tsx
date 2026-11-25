/* 下载管理器：多源任务 + 实时进度模拟 */
import React from 'react'
import { useApp } from '../store'
import { Icon, Empty } from '../ui'
import { DownloadTask } from '../mock'

const KIND_ICON: Record<DownloadTask['kind'], string> = { game: 'gamepad', java: 'cpu', mod: 'package', pack: 'layers', asset: 'file' }

export default function Downloads() {
  const app = useApp()
  const dls = app.downloads
  const active = dls.filter(d => d.status === 'downloading')
  const done = dls.filter(d => d.status === 'done')
  const totalSpeed = active.reduce((s, d) => s + d.speedMBs, 0)
  const hasPaused = dls.some(d => d.status === 'paused')

  return (
    <div>
      <div className="page-head">
        <h1>下载</h1>
        <span className="muted small">多源调度 · 断点续传 · SHA1 全量校验</span>
      </div>
      <div className="card dl-summary">
        <div className="stat"><b className="num">{active.length}</b><span>进行中</span></div>
        <div className="stat"><b className="num">{totalSpeed.toFixed(1)} MB/s</b><span>总速度</span></div>
        <div className="stat"><b className="num">{done.length}</b><span>已完成</span></div>
        <span className="grow" style={{ flex: 1 }} />
        {!app.desktop && (
          <>
            <button className="btn ghost sm" onClick={app.pauseAll} disabled={active.length === 0}><Icon name="pause" size={14} />全部暂停</button>
            <button className="btn ghost sm" onClick={app.resumeAll} disabled={!hasPaused}><Icon name="play" size={14} />全部继续</button>
            <button className="btn quiet sm" onClick={app.clearDone} disabled={done.length === 0}><Icon name="trash" size={14} />清除已完成</button>
          </>
        )}
      </div>
      <div className="card list-card">
        {dls.length === 0 ? (
          <Empty icon="download" title="下载队列是空的" hint="安装实例、模组或整合包时，任务会出现在这里" action={<button className="btn soft sm" onClick={() => app.go('resources')}>去资源中心</button>} />
        ) : dls.map(d => (
          <div key={d.id} className="dl-row">
            <div className={`dl-kind ${d.status === 'done' ? 'done' : d.status === 'error' ? 'error' : ''}`}>
              <Icon name={d.status === 'done' ? 'check' : d.status === 'error' ? 'alert' : KIND_ICON[d.kind]} />
            </div>
            <div className="info">
              <div className="name">
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 420 }}>{d.name}</span>
                <span className={`chip ${d.source === 'BMCLAPI' ? 'primary' : 'outline'}`}>{d.source}</span>
                {d.instanceName && <span className="chip"><Icon name="grid" size={11} />{d.instanceName}</span>}
                {d.status === 'paused' && <span className="chip">已暂停</span>}
                {d.status === 'error' && <span className="chip danger">失败</span>}
              </div>
              {d.status === 'error' ? (
                <div className="sub" style={{ color: 'var(--danger)', fontSize: '0.8rem', marginTop: 3 }}>{d.error} · 将自动回退官方源，也可手动重试</div>
              ) : (
                <>
                  <div className="progress" style={{ marginTop: 6 }}><i style={{ width: `${d.progress}%` }} /></div>
                  <div className="nums">
                    <span>{d.status === 'done' ? '已完成 · 校验通过' : d.status === 'paused' ? '已暂停' : `${d.speedMBs.toFixed(1)} MB/s`}</span>
                    <span>{(d.sizeMB * d.progress / 100).toFixed(1)} / {d.sizeMB.toFixed(1)} MB · {Math.floor(d.progress)}%</span>
                  </div>
                </>
              )}
            </div>
            <div className="ops">
              {!d.id.startsWith('real-') && d.status === 'downloading' && <button className="iconbtn" onClick={() => app.dlOp(d.id, 'pause')} aria-label="暂停"><Icon name="pause" /></button>}
              {!d.id.startsWith('real-') && d.status === 'paused' && <button className="iconbtn" onClick={() => app.dlOp(d.id, 'resume')} aria-label="继续"><Icon name="play" /></button>}
              {!d.id.startsWith('real-') && d.status === 'error' && <button className="iconbtn" onClick={() => app.dlOp(d.id, 'retry')} aria-label="重试"><Icon name="refresh" /></button>}
              {!d.id.startsWith('real-') && d.status !== 'done' && <button className="iconbtn danger" onClick={() => app.dlOp(d.id, 'cancel')} aria-label="取消"><Icon name="x" /></button>}
            </div>
          </div>
        ))}
      </div>
      <p className="muted small" style={{ marginTop: 14 }}>
        演示：进度为本地模拟。正式版由 pomelo-downloader（Rust）驱动：BMCLAPI 优先 → 失效自动回退 Mojang 官方 → 分片并发 + 断点续传 + SHA1 校验。
      </p>
    </div>
  )
}
