# AGENTS.md — 本仓库对所有 AI/代理的强制约定

任何 AI（含子代理、定时任务代理、其他模型接手的会话）在本仓库工作前必须阅读并遵守本文件。

## 0. 进度交接（强制）

1. **开工第一步**：读 [docs/AI-PROGRESS.md](docs/AI-PROGRESS.md)（进度权威）与 [docs/项目企划书.md](docs/项目企划书.md)（产品/设计权威）。
2. **认领**：在 AI-PROGRESS「1. 当前状态」的"进行中"登记自己与任务；发现他人进行中且冲突时先协调（留言/提交说明），不得并行改同一模块。
3. **收尾必更新**：每个工作单元结束，与代码**同一次提交**更新 AI-PROGRESS：
   - 「最后更新」行、「1. 当前状态」；
   - 「6. 代理变更日志」追加一行（日期|代理/模型|工作|验证|遗留）；
   - 新坑进「4. 已知坑」；命令/流程变化同步「3. 命令手册」。
4. 未更新交接文档的工作视为**未完成**；评审/合并前检查该文档是否随代码更新。
5. 只增不删历史；事实须附验证方式；保持 <400 行（超出移归档）。

## 1. 工程约定

- 许可 Apache-2.0；**clean-room**：禁止复制 GPL/自定义/闭源启动器代码（HMCL/SJMCL/PCL/BakaXL），只借鉴思想与公开协议。
- UI 遵循企划书 §6 / DESIGN.md（Pomelo Garden）；桌面模式禁止恢复内层假窗口边框。
- 前端双模式：`isDesktop()` 走 `src/desktop.ts` IPC，浏览器走 mock；新增桌面能力必须同时补 mock 分支或明确标注仅桌面。
- Rust 核心逻辑放 `pomelo-core`（无 UI 依赖），壳层只做薄封装；新增命令同步 `desktop.ts` 类型。
- 测试：核心改动补/改 `crates/pomelo-core/tests`；前端 `tsc --noEmit` 必须过。
- 提交 `feat|fix|chore|docs(scope): ...`；里程碑手动 push（30min 定时同步兜底）。

## 2. 环境速记（详见 AI-PROGRESS §3/§4）

- 本机无 MSVC：GNU 工具链可建 Tauri；app 保留 `custom-protocol` feature；capabilities 改后 `cargo clean -p pomelo-launcher`；重建前 taskkill 运行中 exe。
- 桌面测试数据：`POMELO_ROOT=D:/Project/PomeloLauncher/.m0-data`。
- 用户全屏时 UIA 真实输入被拒：用 element Invoke；不支持图像的模型用 UIA 几何/文本验证。

## 3. 子代理派发模板

派发任何子代理时，prompt 必须包含：
"先读 D:\Project\PomeloLauncher\AGENTS.md 与 docs\AI-PROGRESS.md；遵守其中维护公约；结束时更新 AI-PROGRESS 并随代码提交。"
