/* 官方资源链路：皮肤 / 头像 / 项目 LOGO 优先官方源，失败优雅兜底（离线可用） */

/* ---- Modrinth 官方项目 LOGO（api.modrinth.com 开放 CORS） ---- */
const iconCache = new Map<string, Promise<string | null>>()

export function fetchModrinthIcon(slug: string): Promise<string | null> {
  if (!iconCache.has(slug)) {
    iconCache.set(slug, (async () => {
      try {
        const ctl = new AbortController()
        const timer = setTimeout(() => ctl.abort(), 5000)
        const res = await fetch(`https://api.modrinth.com/v2/project/${encodeURIComponent(slug)}`, { signal: ctl.signal })
        clearTimeout(timer)
        if (!res.ok) return null
        const data = await res.json()
        return typeof data.icon_url === 'string' && data.icon_url ? data.icon_url : null
      } catch {
        return null
      }
    })())
  }
  return iconCache.get(slug)!
}

/* ---- 玩家真实头像 / 皮肤（mc-heads 渲染 Mojang 纹理；正式版走 Mojang sessionserver 全链路） ---- */
export const headUrl = (name: string, size = 64) =>
  `https://mc-heads.net/avatar/${encodeURIComponent(name)}/${size}`

export const skinUrl = (name: string) =>
  `https://mc-heads.net/skin/${encodeURIComponent(name)}`

/* 远程皮肤 CORS 探测结果缓存：浏览器演示环境失败一次后本会话不再重试（正式版由 Rust 核心本地载入） */
let skinRemoteDisabled = false
export const isSkinRemoteDisabled = () => skinRemoteDisabled
export const disableSkinRemote = () => { skinRemoteDisabled = true }

/* 预加载图片：成功返回 url，失败/超时返回 null（不抛错） */
export function preloadImage(url: string, timeoutMs = 4000): Promise<string | null> {
  return new Promise(resolve => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    const timer = setTimeout(() => { img.src = ''; resolve(null) }, timeoutMs)
    img.onload = () => { clearTimeout(timer); resolve(url) }
    img.onerror = () => { clearTimeout(timer); resolve(null) }
    img.src = url
  })
}

/* ---- 离线兜底：按 Minecraft 64×64 皮肤规范程序化绘制经典皮肤 ---- */
export function makeSkinDataURL(variant: 'steve' | 'alex' | 'pomelo'): string {
  const c = document.createElement('canvas')
  c.width = 64; c.height = 64
  const g = c.getContext('2d')!
  const hair = variant === 'alex' ? '#C66B27' : variant === 'pomelo' ? '#5F8230' : '#3B2A1A'
  const skinT = variant === 'alex' ? '#E0B088' : variant === 'pomelo' ? '#D9B48F' : '#C69C6D'
  const skinD = variant === 'alex' ? '#C89668' : variant === 'pomelo' ? '#C09A72' : '#A97C50'
  const shirt = variant === 'alex' ? '#3FA69B' : variant === 'pomelo' ? '#7BA23F' : '#00A8A8'
  const shirtD = variant === 'alex' ? '#358F86' : variant === 'pomelo' ? '#6A8F35' : '#008F8F'
  const pants = variant === 'pomelo' ? '#E8C87A' : '#3B5DC9'
  const pantsD = variant === 'pomelo' ? '#D9B45E' : '#3350AE'
  const shoe = '#5A5A60'
  const eye = variant === 'pomelo' ? '#3E7D3E' : '#4A3B8C'
  const r = (x: number, y: number, w: number, h: number, f: string) => { g.fillStyle = f; g.fillRect(x, y, w, h) }

  /* 头 */
  r(8, 0, 8, 8, hair); r(16, 0, 8, 8, skinD)
  r(0, 8, 8, 8, hair); r(24, 8, 8, 8, hair)
  r(8, 8, 8, 8, skinT); r(16, 8, 8, 8, hair)
  r(8, 8, 8, 2, hair)                       // 刘海
  r(9, 12, 2, 1, '#FFFFFF'); r(13, 12, 2, 1, '#FFFFFF')
  r(10, 12, 1, 1, eye); r(13, 12, 1, 1, eye)
  r(11, 13, 2, 2, skinD)                    // 鼻
  r(10, 15, 4, 1, '#8C6239')                // 嘴
  /* 身体 */
  r(20, 16, 8, 4, shirt); r(28, 16, 8, 4, pants)
  r(16, 20, 4, 12, shirtD); r(28, 20, 4, 12, shirtD)
  r(20, 20, 8, 12, shirt); r(32, 20, 8, 12, shirt)
  r(20, 28, 8, 4, pants)                    // 衣摆下裤腰
  /* 右臂 */
  r(44, 16, 4, 4, shirt); r(48, 16, 4, 4, skinD)
  r(40, 20, 4, 12, skinD); r(48, 20, 4, 12, skinD)
  r(44, 20, 4, 12, skinT); r(52, 20, 4, 12, skinD)
  r(44, 20, 4, 4, shirt); r(40, 20, 4, 4, shirt); r(48, 20, 4, 4, shirt); r(52, 20, 4, 4, shirt)
  /* 右腿（0,16–16,32） */
  r(4, 16, 4, 4, pants); r(8, 16, 4, 4, pantsD)
  r(0, 20, 4, 12, pantsD); r(8, 20, 4, 12, pantsD)
  r(4, 20, 4, 12, pants); r(12, 20, 4, 12, pantsD)
  r(0, 30, 4, 2, shoe); r(4, 30, 4, 2, shoe); r(8, 30, 4, 2, shoe); r(12, 30, 4, 2, shoe)
  /* 左腿（64×64 规范下半区 16,32–32,48） */
  r(20, 32, 4, 4, pants); r(24, 32, 4, 4, pantsD)
  r(16, 36, 4, 12, pantsD); r(24, 36, 4, 12, pantsD)
  r(20, 36, 4, 12, pants); r(28, 36, 4, 12, pantsD)
  r(16, 46, 4, 2, shoe); r(20, 46, 4, 2, shoe); r(24, 46, 4, 2, shoe); r(28, 46, 4, 2, shoe)
  /* 左臂（64×64 规范下半区 32,48–48,64） */
  r(36, 48, 4, 4, shirt); r(40, 48, 4, 4, skinD)
  r(32, 52, 4, 12, skinD); r(40, 52, 4, 12, skinD)
  r(36, 52, 4, 12, skinT); r(44, 52, 4, 12, skinD)
  r(32, 52, 4, 4, shirt); r(36, 52, 4, 4, shirt); r(40, 52, 4, 4, shirt); r(44, 52, 4, 4, shirt)
  return c.toDataURL('image/png')
}
