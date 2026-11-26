/* PomeloLauncher DEMO — 设计系统组件（Pomelo Garden） */
import React, { useEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { SkinViewer, WalkingAnimation } from 'skinview3d'
import { IconKind, TagColor, TAG_COLORS } from './mock'
import { blockForKind, blockForVersion } from './mcBlocks'
import { ClassicFace, classicSkinUrl } from './officialSkins'
import { fetchModrinthIcon, headUrl, skinUrl, preloadImage, makeSkinDataURL, isSkinRemoteDisabled, disableSkinRemote } from './net'
import { useApp } from './store'

/* ---------------- 图标系统：手绘 SVG，统一 1.8 描边 ---------------- */
const P: Record<string, React.ReactNode> = {
  home: <><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h5v-6h4v6h5V9.5" /></>,
  grid: <><rect x="3" y="3" width="7.5" height="7.5" rx="1.5" /><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" /><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" /><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" /></>,
  package: <><path d="M21 8 12 3 3 8v8l9 5 9-5V8Z" /><path d="m3 8 9 5 9-5" /><path d="M12 13v8" /></>,
  download: <><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M4 21h16" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c1.2-3.6 4.2-5.5 8-5.5s6.8 1.9 8 5.5" /></>,
  settings: <><path d="M4 7h10M18 7h2M4 17h2M10 17h10" /><circle cx="16" cy="7" r="2.4" /><circle cx="8" cy="17" r="2.4" /></>,
  play: <path d="M7 4.5v15l12-7.5L7 4.5Z" />,
  pause: <><path d="M8 5v14M16 5v14" /></>,
  stop: <rect x="6" y="6" width="12" height="12" rx="2" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  check: <path d="m4.5 12.5 5 5 10-11" />,
  plus: <path d="M12 5v14M5 12h14" />,
  search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 5 5" /></>,
  folder: <path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />,
  refresh: <><path d="M20 12a8 8 0 1 1-2.3-5.6" /><path d="M20 3v4h-4" /></>,
  star: <path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8L3.5 9.7l5.9-.8L12 3.5Z" />,
  'chevron-left': <path d="m14.5 5-7 7 7 7" />,
  'chevron-right': <path d="m9.5 5 7 7-7 7" />,
  'chevron-down': <path d="m5 9.5 7 7 7-7" />,
  'arrow-up': <path d="M12 19V5m-6 6 6-6 6 6" />,
  'arrow-down': <path d="M12 5v14m-6-6 6 6 6-6" />,
  moon: <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z" />,
  sun: <><circle cx="12" cy="12" r="4.2" /><path d="M12 2.5v2.6M12 18.9v2.6M2.5 12h2.6M18.9 12h2.6M5 5l1.8 1.8M17.2 17.2 19 19M19 5l-1.8 1.8M6.8 17.2 5 19" /></>,
  monitor: <><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></>,
  alert: <><path d="M12 3 2.5 20h19L12 3Z" /><path d="M12 9.5v5" /><path d="M12 17.4v.2" /></>,
  copy: <><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" transform="translate(2 2) scale(0.85)" /></>,
  trash: <><path d="M4 7h16M9 7V4h6v3M6.5 7l1 14h9l1-14" /><path d="M10 11v6M14 11v6" /></>,
  external: <><path d="M14 4h6v6" /><path d="M20 4 11 13" /><path d="M19 14v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5" /></>,
  shield: <><path d="M12 3 4.5 6v6c0 4.5 3 7.6 7.5 9 4.5-1.4 7.5-4.5 7.5-9V6L12 3Z" /><path d="m9 11.8 2.2 2.2 4-4.4" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.8 2.6 4 5.6 4 9s-1.2 6.4-4 9c-2.8-2.6-4-5.6-4-9s1.2-6.4 4-9Z" /></>,
  palette: <><path d="M12 3a9 9 0 1 0 0 18c1.4 0 2-.9 2-1.8 0-1.5-1.3-1.9-1.3-3 0-1.2 1-2.2 2.3-2.2H17a4.5 4.5 0 0 0 4.5-4.5C21.3 5.6 17.1 3 12 3Z" /><circle cx="7.8" cy="10.5" r="1" /><circle cx="12" cy="7.6" r="1" /><circle cx="16.2" cy="10.5" r="1" /></>,
  zap: <path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H12L13 2Z" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 6.5V12l3.5 2.5" /></>,
  server: <><rect x="3" y="4" width="18" height="7" rx="2" /><rect x="3" y="13" width="18" height="7" rx="2" /><path d="M7 7.5v.2M7 16.5v.2" /></>,
  image: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="1.8" /><path d="m5 18 5-5 3 3 3.5-3.5L21 17" /></>,
  file: <><path d="M13 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10l-7-7Z" /><path d="M13 3v7h7" /></>,
  terminal: <><path d="m5 7 5 5-5 5" /><path d="M12 17h7" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5.5" /><path d="M12 7.6v.2" /></>,
  activity: <path d="M22 12h-4l-3 8L9 4l-3 8H2" />,
  layers: <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 13 9 5 9-5" /></>,
  cpu: <><rect x="6" y="6" width="12" height="12" rx="2" /><rect x="9.5" y="9.5" width="5" height="5" /><path d="M9 2.5v3.5M15 2.5v3.5M9 18v3.5M15 18v3.5M2.5 9H6M2.5 15H6M18 9h3.5M18 15h3.5" /></>,
  key: <><circle cx="8" cy="14" r="4.5" /><path d="m11.5 10.5 8-8M17 5l2.5 2.5M14.5 7.5 17 10" /></>,
  minimize: <path d="M5 12h14" />,
  maximize: <rect x="5" y="5" width="14" height="14" rx="2" />,
  filter: <path d="M3 5h18l-7 8v6l-4 2v-8L3 5Z" />,
  lock: <><rect x="5" y="10.5" width="14" height="10" rx="2" /><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" /></>,
  'hard-drive': <><path d="M3 13h18" /><path d="M5.5 6h13l2.5 7v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5l2.5-7Z" /><path d="M7 16.5v.2M11 16.5v.2" /></>,
  book: <><path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5v-17Z" /><path d="M4 19a2.5 2.5 0 0 1 2.5-2.5H20" /></>,
  bell: <><path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6" /><path d="M10 19a2.2 2.2 0 0 0 4 0" /></>,
  wifi: <><path d="M2.5 9a14 14 0 0 1 19 0" /><path d="M6 12.5a9 9 0 0 1 12 0" /><path d="M9.5 16a4.5 4.5 0 0 1 5 0" /><path d="M12 19.2v.2" /></>,
  eye: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="3" /></>,
  gamepad: <><path d="M6 9h12a4 4 0 0 1 4 4v1a3 3 0 0 1-5.2 2L15 14H9l-1.8 2A3 3 0 0 1 2 14v-1a4 4 0 0 1 4-4Z" /><path d="M7 11.5v2M6 12.5h2M16 11.5v.2M18 13v.2" /></>,
}

export function Icon({ name, size, className }: { name: string; size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size ?? 18} height={size ?? 18} fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {P[name] ?? P.info}
    </svg>
  )
}

/* ---------------- 品牌 Logo：柚子 ---------------- */
export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
      <circle cx="16" cy="18" r="12" fill="var(--primary)" />
      <circle cx="16" cy="18" r="8.5" fill="#F2E8C9" />
      <path d="M16 9.5v17M7.5 18h17M10 12l12 12M22 12L10 24" stroke="#E8C87A" strokeWidth="1.6" />
      <circle cx="16" cy="18" r="1.6" fill="#E8C87A" />
      <path d="M16 6c1-3 4-4 6-4-.5 3-3 4.5-6 4z" fill="var(--primary-press)" />
    </svg>
  )
}

/* ---------------- 开关 ---------------- */
export function Toggle({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label?: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled}
      className="switch" onClick={() => onChange(!checked)} />
  )
}

/* ---------------- 弹层 ---------------- */
export function Modal({ title, onClose, children, footer, wide, className }: {
  title: React.ReactNode; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean; className?: string
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
  return (
    <div className="scrim" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={`modal${wide ? ' wide' : ''}${className ? ' ' + className : ''}`} role="dialog" aria-modal="true">
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="iconbtn" onClick={onClose} aria-label="关闭"><Icon name="x" /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  )
}

/* ---------------- Toast ---------------- */
export function Toasts({ items }: { items: { id: string; text: string; kind: string }[] }) {
  const iconOf: Record<string, string> = { success: 'check', info: 'info', warning: 'alert', danger: 'alert' }
  return (
    <div className="toasts" aria-live="polite">
      {items.map(t => (
        <div key={t.id} className={`toast ${t.kind}`}>
          <Icon name={iconOf[t.kind] ?? 'info'} />
          <span>{t.text}</span>
        </div>
      ))}
    </div>
  )
}

/* ---------------- 空状态 ---------------- */
export function Empty({ icon = 'package', title, hint, action }: { icon?: string; title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="empty">
      <Icon name={icon} />
      <div className="t">{title}</div>
      {hint && <div className="small">{hint}</div>}
      {action}
    </div>
  )
}

/* ---------------- 实例图标：官方方块材质 ---------------- */
export function InstanceIcon({ kind, version, versionKind, size = 'md' }: {
  kind: IconKind
  version?: string
  versionKind?: string
  size?: 'lg' | 'md' | 'sm' | 'xs'
}) {
  const cls = size === 'md' ? 'inst-icon' : `inst-icon ${size}`
  const src = version ? blockForVersion(version, versionKind) : blockForKind(kind)
  return <div className={cls}><img className="mc-block" src={src} alt="" draggable={false} /></div>
}

/* ---------------- 账户像素头像 ---------------- */
export function SkinHead({ skin }: { skin: 'steve' | 'alex' | 'pomelo' }) {
  const hair = skin === 'alex' ? '#C66B27' : skin === 'pomelo' ? '#5F8230' : '#3B2A1A'
  const face = skin === 'alex' ? '#E0B088' : skin === 'pomelo' ? '#D9B48F' : '#C69C6D'
  const eye = skin === 'pomelo' ? '#3E7D3E' : '#3B5DC9'
  const r = (x: number, y: number, w: number, h: number, f: string) => <rect key={`${x}${y}${w}${h}`} x={x} y={y} width={w} height={h} fill={f} />
  return (
    <svg viewBox="0 0 8 8" shapeRendering="crispEdges">
      {r(0, 0, 8, 8, face)}
      {r(0, 0, 8, 2, hair)}{r(0, 2, 1, 2, hair)}{r(7, 2, 1, 2, hair)}
      {r(1, 3, 2, 1, '#FFFFFF')}{r(5, 3, 2, 1, '#FFFFFF')}
      {r(2, 3, 1, 1, eye)}{r(5, 3, 1, 1, eye)}
      {r(3, 4, 2, 1, '#A97C50')}
      {r(2, 6, 4, 1, '#8C6239')}
    </svg>
  )
}

/* ---------------- 3D 皮肤：skinview3d 真实渲染（官方皮肤优先，离线兜底） ---------------- */
export function Skin3D({ skin = 'steve', name, width = 92, height = 132 }: { skin?: 'steve' | 'alex' | 'pomelo'; name?: string; width?: number; height?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { settings } = useApp()
  const motionOff = !settings.motion
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let disposed = false
    const viewer = new SkinViewer({ canvas, width, height })
    viewer.zoom = 0.9
    viewer.autoRotate = !motionOff
    viewer.animation = motionOff ? null : new WalkingAnimation()
    const model = skin === 'alex' ? 'slim' : 'default'
    const classic = skin === 'pomelo' ? makeSkinDataURL('pomelo') : classicSkinUrl(skin === 'alex' ? 'alex' : 'steve')
    const apply = (url: string, slim: boolean) => {
      if (!disposed) viewer.loadSkin(url, { model: slim ? 'slim' : 'default' }).catch(() => {})
    }
    apply(classic, model === 'slim')
    if (name && !isSkinRemoteDisabled()) {
      preloadImage(skinUrl(name)).then(u => {
        if (!u) disableSkinRemote()
        if (!disposed && u) apply(u, model === 'slim')
      })
    }
    return () => { disposed = true; viewer.dispose() }
  }, [skin, name, motionOff, width, height])
  return <div className="skin-stage" style={{ width, height }}><canvas ref={canvasRef} style={{ width, height }} aria-label="3D 皮肤预览" /></div>
}

/* ---------------- 玩家头像：优先真实头像（Mojang 纹理渲染），失败回退本地像素 ---------------- */
export function PlayerHead({ name, skin, size = 52 }: { name?: string; skin: 'steve' | 'alex' | 'pomelo'; size?: number }) {
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [name])
  const src = name ? headUrl(name, 64) : null
  if (!src || failed) {
    if (skin === 'steve' || skin === 'alex') {
      return <ClassicFace skin={skin} size={size} />
    }
    return <div className="acc-head" style={{ width: size, height: size }}><SkinHead skin={skin} /></div>
  }
  return <img className="acc-head" style={{ width: size, height: size }} src={src} alt={`${name} 的头像`} onError={() => setFailed(true)} />
}

/* ---------------- 资源缩略图：优先 Modrinth 官方 LOGO，失败回退类别图标 ---------------- */
const CAT_ICON: Record<string, string> = { mod: 'package', resourcepack: 'image', shader: 'sun', modpack: 'layers', world: 'globe' }
export function ResourceIcon({ slug, tone, category, size = 46 }: { slug?: string; tone: string; category: string; size?: number }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let on = true
    setUrl(null)
    if (slug) fetchModrinthIcon(slug).then(u => { if (on) setUrl(u) })
    return () => { on = false }
  }, [slug])
  if (url) {
    return <img className="res-logo" style={{ width: size, height: size }} src={url} alt="" onError={() => setUrl(null)} />
  }
  return (
    <div className="res-icon" style={{ width: size, height: size, background: `${tone}1f`, color: tone }}>
      <Icon name={CAT_ICON[category] ?? 'package'} size={size > 40 ? 24 : 16} />
    </div>
  )
}

/* ---------------- 自定义下拉（Pomelo 风格，portal 渲染避免被裁剪） ---------------- */
export interface SelectOption { value: string; label: string }
export function Select({ value, onChange, options, ariaLabel, width, disabled }: {
  value: string; onChange: (v: string) => void; options: SelectOption[]; ariaLabel?: string; width?: number | string; disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [hi, setHi] = useState(0)
  const [pos, setPos] = useState<{ left: number; top: number; bottom: number; width: number; maxH: number; up: boolean } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const idx = options.findIndex(o => o.value === value)
  const close = useCallback(() => setOpen(false), [])
  const measure = useCallback(() => {
    const btn = btnRef.current
    if (!btn) return
    const r = btn.getBoundingClientRect()
    const gap = 4
    const spaceBelow = window.innerHeight - r.bottom - gap - 8
    const spaceAbove = r.top - gap - 8
    const up = spaceBelow < 220 && spaceAbove > spaceBelow
    setPos({
      left: r.left,
      top: r.bottom + gap,
      bottom: window.innerHeight - r.top + gap,
      width: r.width,
      maxH: Math.max(120, Math.min(300, up ? spaceAbove : spaceBelow)),
      up,
    })
  }, [])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node
      if (btnRef.current?.contains(t) || listRef.current?.contains(t)) return
      close()
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    const onMove = () => measure()
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', onMove)
    window.addEventListener('scroll', onMove, true)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onMove)
      window.removeEventListener('scroll', onMove, true)
    }
  }, [open, measure, close])

  const toggle = () => {
    if (open) { close(); return }
    measure()
    setHi(Math.max(0, idx))
    setOpen(true)
  }
  const onBtnKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) { toggle(); return }
      setHi(h => Math.min(options.length - 1, Math.max(0, h + (e.key === 'ArrowDown' ? 1 : -1))))
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      if (open) { onChange(options[hi].value); close() } else toggle()
    }
  }
  const current = options.find(o => o.value === value)
  const list = open && pos && createPortal(
    <ul ref={listRef} className="psel-list" role="listbox" aria-label={ariaLabel}
      style={{
        position: 'fixed', left: pos.left, width: pos.width, maxHeight: pos.maxH, zIndex: 1200,
        ...(pos.up ? { bottom: pos.bottom } : { top: pos.top }),
      }}>
      {options.map((o, i) => (
        <li key={o.value} role="option" aria-selected={o.value === value}
          className={`${i === hi ? 'hi' : ''} ${o.value === value ? 'sel' : ''}`}
          onMouseEnter={() => setHi(i)}
          onMouseDown={e => e.preventDefault()}
          onClick={() => { onChange(o.value); close() }}>
          <span>{o.label}</span>
          {o.value === value && <Icon name="check" size={13} />}
        </li>
      ))}
    </ul>,
    document.body
  )
  return (
    <div className="psel" style={{ width }}>
      <button ref={btnRef} type="button" className="psel-btn" disabled={disabled} aria-haspopup="listbox" aria-expanded={open}
        aria-label={ariaLabel} onClick={toggle} onKeyDown={onBtnKey}>
        <span className="psel-val">{current?.label ?? value}</span>
        <Icon name="chevron-down" size={14} />
      </button>
      {list}
    </div>
  )
}

/* ---------------- 杂项 ---------------- */
export function TagDot({ tag }: { tag: TagColor }) {
  return <span className="tag-dot" style={{ background: TAG_COLORS[tag] }} title={`颜色标签：${tag}`} />
}

export function LoaderChip({ loader, version }: { loader: string; version?: string }) {
  if (loader === 'Vanilla') return <span className="chip outline">原版</span>
  return <span className="chip primary">{loader}{version ? ` ${version}` : ''}</span>
}

export function PingChip({ ping }: { ping: number }) {
  const cls = ping < 60 ? 'success' : ping < 150 ? 'accent' : 'danger'
  return <span className={`chip ${cls} num`}>{ping} ms</span>
}

/* 演示用像素截图（几何场景） */
export function PixelShot({ variant }: { variant: number }) {
  const scenes = [
    { sky: '#BFE3F2', sun: '#F2C14E', hill: '#8FBF4D', hill2: '#6E9A38', dirt: '#8A6244' },
    { sky: '#F5C88A', sun: '#E8853D', hill: '#7BA23F', hill2: '#5F8230', dirt: '#75513A' },
    { sky: '#2A3550', sun: '#E8EAE3', hill: '#3E5A3E', hill2: '#2E452E', dirt: '#4A3B2A' },
    { sky: '#DCE6F2', sun: '#FFFFFF', hill: '#E8F0F5', hill2: '#C8D8E5', dirt: '#9FB4CC' },
  ]
  const s = scenes[variant % scenes.length]
  const r = (x: number, y: number, w: number, h: number, f: string) => <rect key={`${x}${y}${w}${h}${f}`} x={x} y={y} width={w} height={h} fill={f} />
  return (
    <svg viewBox="0 0 32 18" shapeRendering="crispEdges">
      {r(0, 0, 32, 18, s.sky)}
      {r(24, 2, 4, 4, s.sun)}
      {r(0, 10, 32, 8, s.hill)}
      {r(0, 12, 12, 6, s.hill2)}{r(20, 13, 12, 5, s.hill2)}
      {r(6, 6, 2, 4, '#6E4F2E')}{r(4, 4, 6, 3, s.hill2)}
      {r(14, 14, 6, 4, s.dirt)}{r(15, 13, 4, 1, s.hill2)}
      {r(26, 15, 3, 3, s.dirt)}
    </svg>
  )
}
