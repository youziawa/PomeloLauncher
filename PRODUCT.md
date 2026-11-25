# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

（产品最终形态为 Tauri 2 桌面应用，本 DEMO 为浏览器内运行的高保真前端原型；平台按 web 记录。）

## Stack

React 18 + TypeScript + Vite（由已批准企划书 §4.2 钉住）。DEMO 阶段样式为手写 CSS 设计令牌（企划书 production 目标为 Tailwind + Radix，DEMO 以零额外依赖优先）；无后端，mock 数据层未来替换为 Tauri invoke → pomelo-core（Rust）。

## Users

- 新手玩家：零配置开箱即玩，首次运行 3 步向导。
- 整合包/模组玩家：多实例、版本隔离、模组批量管理、站内资源下载。
- 服主与开发者（P2）：CLI / 深度链接 / 可脚本化。

## Product Purpose

功能全面、体积轻盈、清新易用的跨平台 Minecraft 启动器。成功 = 新手 3 步开玩；崩溃自动诊断给出可行动建议；安装包 ≤20MB / 冷启动 ≤1.5s / 空闲内存 ≤150MB（企划书 §8 硬指标）。

## Positioning

Apache-2.0 宽松许可 + Tauri/Rust 轻量路线 + 原创「Pomelo Garden 清新柚园」设计语言；区别于 GPL 系（HMCL/SJMCL）、自定义许可（PCL）与闭源（BakaXL）。

## Operating Context

桌面窗口形态：自定义标题栏 + 左侧窄边栏 + 内容区；深浅双主题；壁纸系统；游戏启动后启动器可隐藏/退出。DEMO 在浏览器中以"浮动窗口"呈现桌面应用观感。

## Capabilities and Constraints

DEMO 范围（本次交付）：首页（实例卡/账户卡/3D 皮肤/启动流程）、实例列表与详情（模组/资源包/光影/存档/服务器/截图/日志/设置）、资源中心（搜索/依赖安装）、下载管理器（实时进度模拟）、账户（微软设备码/离线/皮肤站向导）、设置（主题/主题色/壁纸/动效/字号等）、首启向导、崩溃诊断弹窗、新建实例。全部数据为 mock，明确标注演示性质；不实际下载/启动游戏。

## Brand Commitments

- 名称：PomeloLauncher / 柚子启动器；意象"剥开即玩"。
- 设计语言：Pomelo Garden（企划书 §6 钉住）：柚叶绿 #7BA23F（浅）/#A8C66C（深）、柚瓤黄 #F2C14E 点缀、奶油白 #FAF9F4 / 炭绿 #191C16 底；卡片圆角 14px、控件 10px；动效 160–240ms cubic-bezier(0.2,0,0,1)，全局可关。
- 许可 Apache-2.0；个性化功能全部免费；默认零遥测。

## Evidence on Hand

- 已批准企划书：docs/项目企划书.md（功能全集、UI 规范、架构、指标）。
- LICENSE：Apache-2.0 全文。
- 无真实用户数据/截图/皮肤素材；DEMO 数据为合成演示数据，须标注。

## Product Principles

1. 三步开玩，默认值兜底。
2. 渐进披露：首页只有实例+账户+启动，高级选项永远可达。
3. 每个错误都有出口：为什么/怎么办/一键导出求助包。
4. 轻量是硬指标。
5. 默认安全与隐私。

## Accessibility & Inclusion

WCAG AA 对比度（正文 ≥4.5:1）；键盘全导航与可见焦点；全局"减少动效"开关；字号 85–115% 缩放。
