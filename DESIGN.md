# Design — Pomelo Garden（清新柚园）

来源：已批准企划书 §6（brief-pinned，不得偏移）。模式：Operate（任务型产品 UI，earned familiarity）。

## 色彩令牌

| 令牌 | 浅色 | 深色 | 用途 |
| --- | --- | --- | --- |
| --primary（柚叶绿） | #7BA23F | #A8C66C | 主按钮/选中/品牌 |
| --on-primary | #1F2616 | #191C16 | 主按钮文字（深字浅底，保 4.5:1） |
| --accent（柚瓤黄） | #F2C14E | #E8B84B | 高亮/进度点缀/徽标 |
| --bg | #FAF9F4 | #191C16 | 窗口底 |
| --surface | #FFFFFF | #232720 | 卡片 |
| --surface-2 | #F3F2EA | #2C3128 | 边栏/次级面板（第二中性层） |
| --text | #2B2E26 | #E8EAE3 | 正文 |
| --muted | #6E7266 | #9BA093 | 次要信息（≥4.5:1） |
| --border | #E5E3D8 | #3A4034 | 分隔 |
| --danger | #C4453F | #E57368 | 错误/危险操作 |
| --warning | #9A6B12 | #E0B050 | 警告 |
| --success | #3E7D3E | #7FBF7F | 成功 |
| --info | #3A72B0 | #7FB2E5 | 信息 |

主题色自定义：8 预设（柚叶绿/海盐蓝/柑橘橙/樱花粉/薰衣紫/青碧/石墨/柚瓤黄），仅替换 primary 族，语义色不变。soft/hover 用 color-mix 派生。

## 形状 / 字体 / 动效

- 圆角：卡片 14px、按钮/输入 10px、标签 8px；头像圆形。
- 间距：4px 网格；页面边距 24px；卡片间距 16px。
- 字体：单一家族 `"MiSans","HarmonyOS Sans",system-ui,"PingFang SC","Microsoft YaHei",sans-serif`；等宽日志 `Consolas,"JetBrains Mono",monospace`。基准 14px，比例 ~1.125：12/13/14/16/18/22。
- 动效：160–240ms，cubic-bezier(0.2,0,0,1)；状态传达而非装饰；页面切换淡入+8px 位移；`[data-motion="off"]` 与 prefers-reduced-motion 全局降级。
-  elevation 只声明一次：卡片用 1px border，弹层用软阴影（有偏移+模糊）。

## 布局

- 浮动"桌面窗口"（DEMO 浏览器内呈现）：自定义标题栏（左 Logo+名称+DEMO 徽标，右 ─ □ ✕）+ 左侧 76px 边栏（图标+文字）+ 内容区。
- 首页：实例卡（左）+ 账户卡（右，含 CSS 3D 皮肤预览）→ 大号启动按钮（签名交互：preflight 检查清单 → 启动进度 → 运行态）→ 最近游玩。
- 实例详情：概览条 + Tab（模组/资源包/光影/存档/服务器/截图/日志/设置）。
- 壁纸层：内容区底层可选像素柚园 SVG 场景（低透明度），卡片保持不透明。

## 组件词汇

按钮（primary/soft/ghost/danger，同一形状词汇）、开关（role=switch）、原生 select/range  styled、标签 chips、进度条、卡片、Modal（仅用于需要保护焦点的任务：向导/崩溃/安装确认/添加账户）、Toast（右下）、空状态（教学式）、骨架/加载态。图标：手绘 SVG 线性图标库（统一 1.8 描边），不用 emoji 充当图标。

## 浏览器细节

选区/光标/滚动条/焦点环/表格数字（tabular-nums）全部按令牌着色。

## 状态词汇

hover / focus-visible / active / disabled / loading / error / empty / selected / running 全组件覆盖。
