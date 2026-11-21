# ant 功能调查记录与分步清理方案

## Context

本次调查发现，本仓库的 Anthropic 员工功能混合了四种状态：有实际实现、仅提示词工作流、写死 external 导致入口关闭、恢复源码时留下的禁用 stub。不能仅凭名称或注册入口判断功能可用，也不能把本地 `USER_TYPE=ant` 当成服务端权限。

用户希望保留有用的本地能力、将指定能力开放给普通用户，并删除指定的员工实验和内部服务功能。此前已删除内置 `/commit`、`/commit-push-pr`、`/verify`，这些改动保留，不回退。本文先记录调查结果，再作为分步执行及验收清单。

## 调查结论

### 有实际用途的本地功能

| 功能 | 通俗说明 | 当前实现及本轮决定 |
| --- | --- | --- |
| `/skillify` | 从本次会话提取可重复流程，问答确认后写成 Skill | 有完整提示词和会话提取逻辑；保留 |
| `/remember` | 整理自动记忆与 CLAUDE.md，提出重复、过时、冲突处理建议 | 有完整提示词，修改前需批准；保留 |
| `/files` | 列出会话文件读取缓存中的文件，不是全部上下文来源 | 有实现；保留 |
| `/tag` | 给会话设置一个可搜索标签，支持替换和确认删除 | 有持久化实现；保留 |
| ConfigTool | 模型通过专门工具读写白名单设置，修改时请求权限 | 有实际读写；部分写入是用户级而非项目级；保留 |
| `/init-verifiers` | 为网页、CLI、API 生成启动、登录、验收说明 Skill | 提示词完整，但旧 Verify 自动发现闭环未证实；保留，不扩大本轮范围 |
| 持久保存 max effort | 下次会话仍能沿用 max 思考强度设置 | 开放给普通用户；不扩大模型对 max 的支持范围 |
| 详细 `/context` | 展示系统工具、系统提示分段、消息及工具结果的 token 明细 | 开放给普通用户，覆盖数据生成、交互展示及非交互输出 |
| 计划模式访谈 | 边读代码边提问、逐步写方案 | 保留 |
| 跨 worktree 恢复 | 同仓库其他 worktree 的会话可走直接恢复分支 | 保留 |
| 全屏防闪烁 | 终端绘制和滚动方式增强 | 保留 |

### 本轮明确删除的功能

| 功能 | 实际用途 | 删除边界 |
| --- | --- | --- |
| `/cost` | 查询会话成本估算，员工订阅模式额外显示估算 | 用户已确认删除整个命令；不删除其他功能依赖的成本统计基础设施 |
| 运行中立即执行模型设置命令 | `/model`、`/fast`、`/effort` 不等待当前轮结束即可处理 | 删除这三个命令的立即执行设置；保留命令和通用队列／其他命令的 immediate 机制 |
| 推测执行 | 针对下一句建议提前运行后台代理，接受后复用结果 | 删除后台执行、临时副本、接管提交、状态、设置和节省时间统计；普通输入建议保留 |
| 内部模型配置 | 员工实验模型列表、别名、默认参数、系统提示后缀等适配 | 删除配置模块及所有消费分支，保留普通模型和第三方能力覆盖 |
| insights 员工扩展 | 收集 Homespace 会话、上传内部存储并提供分享链接 | 删除远程发现、SSH/SCP 收集、上传和对应提示／元数据；保留本地报告 |
| `/lorem-ipsum` | 生成大量填充文本测试长上下文 | 删除注册与专用实现 |
| `/bridge-kick` | 人为模拟远程控制断线等故障 | 删除命令、专用故障注入模块和接线；保留正常 Remote Control |
| `/version` | 查询当前会话版本和构建时间 | 删除斜杠命令；保留 CLI `--version`、版本信息和更新功能 |
| API 旧工具结果清理 | API 按阈值删除旧工具调用及结果，降低上下文占用 | 删除员工专用清理策略、环境开关和专用类型；保留 thinking 保留／清理逻辑及客户端正常压缩 |

### 内部环境能力及空壳：本轮不主动扩大删除

- Undercover：公开仓库提交时避免内部信息和署名泄露；保留。
- Chrome 自动启用、Computer Use 员工优先条件：仍依赖其他配置及环境；保留。
- `/stuck`：真实的进程排障提示词，但主要适配 macOS/Linux，带内部 Slack 流程；保留。
- 本地实验配置覆盖：当前只读取本地配置，但覆盖入口仍限定 ant；保留。
- 终端标签状态指示等其他员工 UI 差异：保留。
- `/share`、`/teleport`、`/bughunter`、`/autofix-pr`、`/issue`、`/summary`、`/ctx_viz`、`/backfill-sessions`、`/good-claude`、`/env`、`/oauth-refresh`、`/debug-tool-call`、`/ant-trace`、`/perf-issue`、`/mock-limits`、`/reset-limits`、`/onboarding`：入口为禁用 stub；本轮不顺带删除。
- `/agents-platform` 明确未恢复；远程 CCR Agent、内部 CLI 和 ccshare 的部分入口固定关闭；本轮不扩展处理。

## 分步执行方案

### 第一步：向普通用户开放两项能力

- `src/utils/effort.ts`：移除 max 持久化和读取的员工身份限制；仍保留模型实际支持判断，删除内部模型后只保留正常支持来源。
- `src/utils/analyzeContext.ts`：取消详细数据输出的员工过滤，核查详细数据生产处，不额外发起重复分析请求。
- `src/components/ContextVisualization.tsx`：开放当前被 `false` 等构建常量屏蔽的详情展示，移除 ANT-ONLY 标签，保持 React 编译缓存槽位与依赖一致。
- `src/commands/context/context-noninteractive.ts`：同步开放文本明细，去掉员工专用标题。

### 第二步：移除成本命令和小型专用入口

- `src/commands.ts`：删除 cost、bridge-kick、version 的导入和注册；保留其他命令。
- 删除 `src/commands/cost/` 专用实现、`src/commands/version.ts`、`src/commands/bridge-kick.ts`。
- `src/skills/bundled/index.ts`：删除 lorem-ipsum 注册；删除 `loremIpsum.ts`。
- `src/commands/model/index.ts`、`fast/index.ts`、`effort/index.ts`：移除 immediate getter 及其导入；删除无其他调用者的 `src/utils/immediateCommand.ts`。
- 检查命令相关提示文本，清除失效入口推荐，不删除通用技能示例或其他正常命令。

### 第三步：删除内部模型适配

- 定向读取并清理 `src/utils/model/antModels.ts` 的所有调用点：`model.ts`、`modelOptions.ts`、`effort.ts`、`context.ts`、`thinking.ts`、`constants/prompts.ts`、`permissions/yoloClassifier.ts` 等。
- 删除内部默认模型、内部模型菜单、内部模型专用上下文／输出限制、数值 effort 默认项及系统提示后缀逻辑。
- 保留普通模型选择、用户指定模型、第三方能力覆盖及基础模型能力判断。清理因删除引入的无用导入和注释；不以空函数兼容。

### 第四步：删除推测执行，保留普通输入建议

- 删除 `src/services/PromptSuggestion/speculation.ts`。
- `promptSuggestion.ts` 保留建议生成和展示，但不再启动后台推测代理。
- 清理 `src/components/PromptInput/PromptInput.tsx`、`src/screens/REPL.tsx`、`src/hooks/usePromptSuggestion.ts` 中推测接受／取消／接管分支；建议接受后按正常提交流程运行。
- 同步精简 `onSubmit` 参数及调用点，重点核查 `useCommandKeybindings.tsx` 等依赖位置，避免可选参数位置错位。
- 清理 `src/state/AppStateStore.ts`、`AppState.tsx`、`src/main.tsx`、`src/utils/config.ts` 的推测状态和初始化，以及设置面板中的开关。
- 清理 `src/components/Stats.tsx`、`src/utils/stats.ts`、会话存储与日志类型中的专用节省时间统计和接受事件；历史记录不得因此无法恢复，按现有未知事件忽略路径处理，不迁移或重写用户日志。
- 区分另一套 Bash 权限分类预检查：`speculativeChecks` 是权限性能机制，不属于“猜你下一句”，不删除。
- 通用 forkedAgent、工具拦截接口只在确认无其他调用者时删专用项，否则仅调整过时注释，不扩大范围。

### 第五步：删除内部报告扩展、Bridge 故障注入、API 工具清理

- `src/commands/insights.ts`：删除 Homespace 数据类型、远程发现和收集函数、参数分支、内部上传、分享提示和专用元数据；本地 HTML 报告和正常分析保持原样。核查 `generateUsageReport` 的外部调用点后精简参数与返回值。
- `src/bridge/replBridge.ts`：撤掉 `bridgeDebug.ts` 的故障注入包装和调试句柄，调用正常实现；删除专用模块及过时引用。保留独立的正常 Bridge handle 和重连逻辑。
- `src/services/compact/apiMicrocompact.ts`：只移除 `clear_tool_uses_20250919` 等工具清理策略；保留 `clear_thinking_20251015`。
- `src/utils/betas.ts`：去掉员工 opt-in 的工具清理 beta 分支，仍为现存 thinking 路径保留需要的 beta。

### 第六步：验证与更新文档

- 每完成一组立即更新本文执行状态，记录实际文件范围和任何必要偏差。
- 全文检索已删功能的导入、注册、状态字段和提示词引用，确认没有失效入口。
- 提供一个顶部定义检查常量、无新增第三方依赖、可一键运行的回归检查脚本。以静态断言和可独立调用的轻量逻辑为主，不执行完整构建。
- 手动验收说明：普通身份保存 max 后重启；交互／非交互 context 的详情；输入建议接受、取消、手动编辑及正常提交；模型命令等待；本地 insights；正常 Remote Control；旧会话恢复；CLI `--version`。
- 不运行构建，不执行 Git 提交、推送、合并，不删除用户历史配置或日志。测试若需要真实 API 或启动应用，由用户选择后执行。

## 分阶段执行补充

用户在开始实施后要求分阶段执行，避免一次处理消耗过多上下文。因此本轮只完成已启动工作的收束，不继续展开剩余入口删除；后续以本文状态继续，不重复调查。

第一阶段已修改：`utils/effort.ts` 开放所有命名级别持久化；`utils/analyzeContext.ts` 开放明细数据生产与返回；`components/ContextVisualization.tsx` 去掉固定关闭条件与员工标题；`commands/context/context-noninteractive.ts` 同步开放文本明细。新增根目录独立脚本 `test-ant-feature-cleanup.mjs`，运行 `node test-ant-feature-cleanup.mjs` 已通过。该检查验证真实持久化函数正文和 context 静态入口，不替代终端交互或真实应用验收。

已并行完成内部模型清理：删除 `utils/model/antModels.ts`；更新 `model.ts`、`modelOptions.ts`、`effort.ts`、`context.ts`、`thinking.ts`、`constants/prompts.ts`、`permissions/yoloClassifier.ts`、`hooks/useMainLoopModel.ts`。不迁移用户旧模型别名，旧内部别名可能作为自定义模型名透传并被上游拒绝。

## 执行状态

- [x] 调查结论及用户选择已落盘。
- [x] 已确认删除整个 `/cost`，保留三个模型设置命令但取消运行中立即执行。
- [x] 第一步：开放 max 持久化与详细 context（纯函数／静态回归通过，交互待手验）。
- [ ] 第二步：清理小型命令入口（尚未开始；`/cost`、`/version`、`/lorem-ipsum`、`/bridge-kick` 及模型命令 immediate 暂仍保留，等待下一阶段）。
- [ ] 第三步：核心内部模型配置及消费已删除；仍需清理 REPL 中固定关闭的 `AntModelSwitchCallout` / `shouldShowAntModelSwitch` 入口及相关空壳，完成最终引用检查。
- [x] 第四步：推测执行模块、状态、接管参数、设置、日志事件和统计已清理；检索无 speculation/Speculation 残留，已抽查普通建议接受走正常提交。交互仍待用户手验。
- [ ] 第五步：insights 远程收集／上传和 API 工具清理已修改；Bridge 调试暂未删除，保留完整引用待下一阶段。
- [ ] 第六步：引用检查、回归脚本及手动验收说明。
