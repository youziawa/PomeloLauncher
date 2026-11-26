/* 版本默认图标：Minecraft Wiki 上的官方方块渲染（Java Edition 材质）。 */
import grass from './assets/mc/grass.png'
import grassOld from './assets/mc/grass-old.png'
import cobble from './assets/mc/cobble.png'
import bedrock from './assets/mc/bedrock.png'
import craft from './assets/mc/craft.png'
import nether from './assets/mc/nether.png'
import deepslate from './assets/mc/deepslate.png'
import amethyst from './assets/mc/amethyst.png'
import cherry from './assets/mc/cherry.png'
import sculk from './assets/mc/sculk.png'
import copper from './assets/mc/copper.png'
import tnt from './assets/mc/tnt.png'
import command from './assets/mc/command.png'
import type { IconKind } from './mock'

const FOOLS = new Set([
  '15w14a', '1.RV-Pre1', '3D Shareware v1.34', '20w14infinite', '22w13oneblock',
  '23w13a_or_b', '24w14potato', '25w14craftmine', '2.0',
])

export function blockForVersion(id: string, kind?: string): string {
  if (FOOLS.has(id)) return tnt
  if (kind === 'old_alpha' || id.startsWith('a') || id.startsWith('rd-') || id.startsWith('c0.')) return bedrock
  if (kind === 'old_beta' || id.startsWith('b') || id.startsWith('inf-')) return cobble
  if (kind === 'snapshot' || kind === 'pending') return kind === 'pending' ? command : craft
  const m = /^(\d+)\.(\d+)/.exec(id)
  if (!m) return grass
  const major = Number(m[1])
  const minor = Number(m[2])
  if (major > 1) return grass
  if (minor >= 21) return copper
  if (minor === 20) return cherry
  if (minor === 19) return sculk
  if (minor === 18) return deepslate
  if (minor === 17) return amethyst
  if (minor === 16) return nether
  if (minor >= 14) return grass
  return grassOld
}

export function blockForKind(kind: IconKind): string {
  if (kind === 'gear') return copper
  if (kind === 'camera') return amethyst
  if (kind === 'clock') return cobble
  if (kind === 'bug') return tnt
  return grass
}
