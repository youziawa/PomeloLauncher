/* Mojang 公开发布的默认皮肤模板：https://assets.mojang.com/SkinTemplates/ */
import steve from './assets/skins/steve.png'
import alex from './assets/skins/alex.png'

export type ClassicSkin = 'steve' | 'alex'

export const STEVE_SKIN = steve
export const ALEX_SKIN = alex

export function classicSkinUrl(skin: ClassicSkin): string {
  return skin === 'alex' ? alex : steve
}

/** 64×64 皮肤正面脸部（8,8 起 8×8）裁成头像 */
export function ClassicFace({ skin, size = 52 }: { skin: ClassicSkin; size?: number }) {
  const scale = size / 8
  const img = scale * 64
  const offset = scale * 8
  return (
    <span className="classic-face" style={{ width: size, height: size }} aria-hidden>
      <img
        src={classicSkinUrl(skin)}
        alt=""
        draggable={false}
        style={{ width: img, height: img, marginLeft: -offset, marginTop: -offset }}
      />
    </span>
  )
}
