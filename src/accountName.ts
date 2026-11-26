/** 游戏名里出现中文时给出说明。Minecraft 离线名通常不能用中文。 */
export function chineseNameWarning(name: string): string | null {
  if (/[\u3400-\u9fff]/.test(name)) {
    return 'Minecraft 通常不能使用中文作为游戏名，请改用英文字母、数字或下划线。'
  }
  return null
}
