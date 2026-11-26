# AI 协作进度交接文档（AI-PROGRESS）

> **本文件是所有参与本项目的 AI/代理的唯一进度权威来源。**
> 最后更新：2026-11-26 11:10 (Asia/Shanghai) · 更新者：Cursor (grok-4.7)
> 配套强制约定见仓库根 [AGENTS.md](../AGENTS.md)（已被 DSH harness 作为工作区指令自动加载，实测生效）。

---

## 0. 维护公约（所有 AI 必须遵守）

1. **开工前必读**本文件 + [AGENTS.md](../AGENTS.md) + [docs/项目企划书.md](项目企划书.md)（产品与设计权威）。
2. **每个工作单元结束必须更新本文件**（与代码同一次提交）：
   - 更新「1. 当前状态」与「最后更新」行；
   - 在「6. 代理变更日志」追加一行：`日期 | 代理名/模型 | 做了什么 | 验证方式 | 遗留/下一步`；
   - 新发现的坑写入「4. 已知坑」；命令/流程变化同步改「3. 命令手册」。
3. **认领工作**：开始前在「1. 当前状态」的"进行中"写明自己与任务，避免多代理冲突；结束后移除或标记完成。
4. **只增不删历史**：变更日志追加式；过时内容移入「7. 归档」而非删除。
5. **事实必须可验证**：写"已验证"必须附验证方式（测试名/命令/截图路径/UIA 观察）；未验证写"待验证"。
6. 保持本文件 < 400 行；超出时把旧日志移入归档。
7. 提交信息遵循 `feat|fix|chore|docs(scope): ...`；里程碑手动 `git push`（另有 30 分钟定时同步兜底）。

## 1. 当前状态

- **阶段**：M1 进行中（M0 已完成并实测）。
- **进行中**：无（Cursor 于 2026-11-26 11:38 接入 Forge/NeoForge 官方安装器后空闲）。
- **已完成且实测**：
  | 能力 | 证据 |
  | --- | --- |
  | 竞品调研 + 企划书 v1.6 | docs/项目企划书.md（含修订记录） |
  | 浏览器高保真 DEMO（Pomelo Garden） | dist/index.html 单文件；docs/desktop/*.png |
  | Rust 核心：版本解析/inheritsFrom/规则/类路径/参数替换/Java 匹配/离线 UUID | `cargo test --workspace` 12 项 |
  | 下载引擎：镜像重写/并发/SHA1/natives 解压 | CLI install 1.21.4 共 4102 文件 0 失败 |
  | Tauri 桌面壳 + 窗口控制（拖拽/最小化/最大化/关闭） | UIA 实测；capabilities 见 src-tauri/app/capabilities/default.json |
  | 桌面真实数据：实例列表/创建/安装进度/启动/结束/日志/版本列表 | UIA 走查 + 进程/日志证据 |
  | Fabric 安装器 + Modrinth 真实模组安装 | Fabric 0.20.1 + MC 26.3 + 50 mods 启动成功（logs） |
  | Java 按版本 JSON 匹配（26.x→25） | 修复前 Fabric 报"需 Java≥25"，修复后自动选 25 |
  | Microsoft 设备码登录 UI（客户端 ID 可配置）+ 真实令牌启动 | UI 走查；**完整登录待有 Azure ID 后实测** |
  | 真实崩溃捕获 + 规则诊断 + 脱敏求助包 | Java8 启动 26.3 → 弹窗「Java 版本不匹配」；help/ 目录四文件 |
  | GitHub 定时同步（30min） | 任务 `PomeloLauncher GitHub Sync`；.git/github-sync.log |
- **待验证/未完成**：见「5. backlog」。

## 2. 仓库地图

```
src/                    React18+TS+Vite 前端（浏览器 DEMO 与桌面共用）
  store.tsx             双模式状态机：desktop=isDesktop() 时走 IPC，否则 mock
  desktop.ts            Tauri invoke/listen 封装（唯一 IPC 入口）
  pages/ ui.tsx overlays.tsx styles.css（Pomelo Garden 令牌）
src-tauri/
  crates/pomelo-core    无 UI 核心库：meta/fabric/modrinth/java/launch/instance/auth
  crates/pomelo-downloader  镜像/并发/SHA1/natives
  crates/pomelo-cli     pomelo java|versions|install[--instance]|launch|info
  app/                  Tauri2 壳（独立 workspace；MSVC 推荐，GNU 实测可用）
docs/                   企划书(权威) / M0-技术验证 / 本文件 / desktop 截图
scripts/                sync-github.* + register-sync-task.bat；dev/ 开发辅助
dist/                   vite build 单文件产物（桌面 release 会嵌入它）
```

## 3. 命令手册（实测有效）

```bash
# 前端
pnpm install && pnpm dev            # http://localhost:5173（浏览器 DEMO）
pnpm build                          # dist/index.html（桌面嵌入源）
# Rust（本机无 MSVC，用 GNU；cargo 在 ~/.cargo/bin）
export PATH="$HOME/.cargo/bin:$PATH"
cd src-tauri && cargo test --workspace
cargo build --release -p pomelo-cli
cd app && cargo build --release     # 先 taskkill 运行中的 pomelo-launcher.exe（exe 被锁）
# 运行桌面（测试数据目录）
POMELO_ROOT=D:/Project/PomeloLauncher/.m0-data ./src-tauri/app/target/release/pomelo-launcher.exe
# CLI 真实安装/启动
./src-tauri/target/release/pomelo.exe install 1.21.4 --mirror --root <dir>
./src-tauri/target/release/pomelo.exe launch <实例> --name Steve --root <dir>
```

## 4. 已知坑（改前必读）

1. **custom-protocol**：app crate 必须保留 tauri feature `custom-protocol`，否则 plain cargo build 走 dev mode 连 localhost:5173（vite 停了就错误页）。
2. **capabilities 改动后**必须 `cargo clean -p pomelo-launcher` 再建，否则 ACL 沿用旧产物（窗口按钮静默失效）。
3. **release exe 被运行进程锁定**：重建前 `taskkill /IM pomelo-launcher.exe /F`。
4. **桌面启动日志**在 `logs/launcher.log`（每次截断）；MC 自身日志在 `logs/latest.log`；诊断优先前者。
5. **Java 匹配**优先版本 JSON `javaVersion.majorVersion`；启发式仅兜底（26.x→25）。
6. **库去重 key 含 classifier**；natives 变体按架构后缀过滤（-arm64/-x86），否则原版主体 jar 被覆盖（曾致 jtracy NoClassDefFoundError）。
7. **UIA 自动化**：用户全屏应用时真实鼠标/键盘被系统拒绝（WCU_USER_FULLSCREEN），改用 element Invoke；模型若不支持图像，用 UIA 几何/文本验证而非截图。
8. **许可_clean-room**：Apache-2.0；禁止复制 HMCL/SJMCL(GPL)/PCL(自定义)/BakaXL(闭源) 代码；只借鉴思想与公开协议。
9. **设计权威**：UI 改动遵循企划书 §6 / DESIGN.md（Pomelo Garden）；桌面模式不得 reintroduce 内层假窗口边框（.desktop-mode）。
10. 本机 Java：8/17/21/24/25 均在；gh 已登录 youziawa；WebView2 已装。
11. **编译缓存已清（2026-11-26）**：`src-tauri/target/debug`、`src-tauri/app/target/debug` 与两处 `release/build` 已删除。保留 `pomelo.exe`、`pomelo-launcher.exe`、`WebView2Loader.dll`（dll 必须留在 exe 旁）。下次 `cargo build` / `cargo test` 会全量重编。`.m0-data` 两个实测实例未动。
12. **桌面 exe 必须是 GUI subsystem**：GNU 默认编出控制台程序（PE subsystem=3）。双击会弹出终端，关掉终端进程就退出。`main.rs` 已加 `#![windows_subsystem = "windows"]`；当前 release exe 已把 subsystem 改成 2。CLI `pomelo.exe` 保持控制台。
13. **微软正版登录**：使用公开的 Minecraft 客户端 `00000000402b5328`，登录窗口拦截 `oauth20_desktop.srf` 的 code。MBI_SSL 令牌的 Xbox RpsTicket 不加 `d=` 前缀。用户不填客户端 ID、不抄设备码。

## 5. Backlog（按建议顺序）

- M1：Forge/NeoForge 安装器；下载分片+断点续传；令牌进系统密钥环（keyring）；Microsoft 登录端到端实测（需 Azure ID）；整合包导入/导出（mrpack/CF/MultiMC）；崩溃规则库外置 TOML + 社区贡献。
- M2：CurseForge API、中文译名缓存、资源包优先级真实写入、截图/存档管理接真实目录、i18n、扩展系统、CLI 完善。
- M3：P2P 联机评估、发现页、统计、多渠道分发、三平台 CI。

## 6. 代理变更日志（追加式）

| 日期 | 代理/模型 | 工作 | 验证 | 遗留/下一步 |
| --- | --- | --- | --- | --- |
| 2026-11-25 | lead(qwen4-max)+4 调研子代理 | 四启动器调研、企划书 v1.0 | 仓库/文档交叉核实 | — |
| 2026-11-26 01:0x | lead(qwen4-max) | 高保真 DEMO（含 skinview3d/官方LOGO/实例选择/portal 下拉） | 浏览器走查+tsc+detector | — |
| 2026-11-26 02:0x | lead(deepseek-flash) | M0 核心/CLI/Tauri 壳/桌面接线/窗口权限/GitHub 同步 | cargo test 12 项、4102 文件安装、UIA | Forge/登录/断点 |
| 2026-11-26 09:2x | lead(qwen4-max) | 边框修复、custom-protocol 根因、Fabric+Modrinth+Java25 | Fabric 50 mods 启动日志 | 微软登录/崩溃 |
| 2026-11-26 10:0x | lead(qwen4-max) | 微软设备码 UI、真实崩溃诊断+求助包、目录整理 | Java8 崩溃弹窗命中、help/ 四文件 | Forge/NeoForge |
| 2026-11-26 10:15 | lead(qwen4-max) | 建立本交接文档 + AGENTS.md 强制维护约定 | 文件入库 | 所有代理遵守 §0 |
| 2026-11-26 10:20 | lead(qwen4-max) | AGENTS.md 被 harness 自动加载为工作区指令；README 增加交接入口 | 系统指令回显确认 | 后续代理开工必读 |
| 2026-11-26 10:23 | Cursor(grok-4.7) | 删除 Cargo debug 与 release/build 缓存、空日志、app/gen；保留两个 release exe 与 WebView2Loader.dll | 删后 src-tauri 从约 6809MB 降到 42.6MB；exe 与 dll 仍在 | 下次 cargo 全量重编；.m0-data 约 1118MB 仍保留 |
| 2026-11-26 10:34 | Cursor(grok-4.7) | 桌面 exe 从控制台子系统改为窗口子系统，避免双击闪终端后退出 | PE subsystem 3→2；Start-Process 后窗口标题 PomeloLauncher 且进程未退出 | 下次 cargo build 由 windows_subsystem 属性保持 |
| 2026-11-26 10:57 | Cursor(grok-4.7) | 新建实例改为版本目录：正式/快照/远古 + Fabric/Quilt/Forge/NeoForge 版本列表；Fabric/Quilt 按所选版本安装 | cargo test loaders 2 项；release exe subsystem=2，窗口标题 PomeloLauncher | Forge/NeoForge 只记录版本，安装器未接 |
| 2026-11-26 11:10 | Cursor(grok-4.7) | 微软正版登录改为系统浏览器授权码 + PKCE + localhost 回跳 | auth PKCE 测试 2 项；release 编译成功 | 端到端登录待有 Azure 客户端 ID 实测；重定向须注册 http://localhost |
| 2026-11-26 11:15 | Cursor(grok-4.7) | 去掉 Azure 客户端 ID 输入；登录窗口用公开 Minecraft 客户端拦截授权码 | release 编译成功 | 端到端登录待用户在弹出窗口实测 |
| 2026-11-26 11:18 | Cursor(grok-4.7) | 修复登录窗口秒关：授权 URL 里的 redirect 不再被当成回跳 | 单测 authorize_url_is_not_a_callback | 待用户再登一次 |
| 2026-11-26 11:28 | Cursor(grok-4.7) | 版本/实例默认图标换成 Minecraft Wiki 官方方块渲染，按版本年代区分 | 材质来自 minecraft.wiki/images | 嵌入桌面版后目视 |
| 2026-11-26 11:38 | Cursor(grok-4.7) | Forge/NeoForge 创建时下载官方安装器并以 --installClient 装进实例目录 | installer URL 单测；NeoForge --help 确认参数；release 编译 | 未在本机完整跑完一次 Forge 安装 |

## 7. 归档

（暂无；旧日志满 400 行时移入此处。）
