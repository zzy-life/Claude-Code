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

### 第二阶段：小型入口清理（2026-11-21）

开始前已核对当前代码：第一步开放、第三步核心内部模型删除、第四步推测执行主链路删除，以及第五步 insights 远程扩展／API 工具清理均与已有记录一致；尚未进行交互验收。

本阶段完成第二步：

- `src/commands.ts` 删除 cost、bridge-kick、version 导入和注册，同时删除 cost 的 Remote／Bridge 安全白名单项。
- 删除六个专用文件：`commands/cost/index.ts`、`commands/cost/cost.ts`、`commands/version.ts`、`commands/bridge-kick.ts`、`skills/bundled/loremIpsum.ts`、`utils/immediateCommand.ts`（路径均相对于 `src/`）。
- `skills/bundled/index.ts` 删除 lorem-ipsum 注册；`commands/model/index.ts`、`commands/fast/index.ts`、`commands/effort/index.ts` 删除 immediate getter 及导入，保留命令、通用队列和其他命令的立即执行能力。
- `entrypoints/sdk/coreSchemas.ts`、`utils/messages/mappers.ts` 替换过时的 `/cost` 示例，不改变输出结构。
- 扩展根目录 `test-ant-feature-cleanup.mjs`：覆盖专用文件删除、源码失效引用、三个命令的 immediate 删除、其他 immediate 保留、成本基础设施及 CLI 版本入口保留。执行 `node test-ant-feature-cleanup.mjs` 已通过；这是纯函数／静态检查，不代表终端运行验证。
- 本阶段未修改 Bridge 底层；`replBridge.ts` 与 `bridgeDebug.ts` 中的故障注入接线和 `/bridge-kick` 注释明确留到第五步，回归脚本暂允许这两处引用。

核对时发现的后续收尾项（本阶段不扩大改动范围）：

- 第三步：REPL 的 `AntModelSwitchCallout`／`shouldShowAntModelSwitch` 与组件空壳仍待删除；`model.ts` 内部代号注释过时。`modelCapabilities.ts` 员工能力发现及 effort 数值展示并非已删 antModels 配置消费，后续须按原定边界判断，不能顺带扩大删除。
- 第四步：`utils/telemetry/perfettoTracing.ts` 仍有无人传入的 `isSpeculative` 参数／`is_speculative` 字段；主执行链路已删，但该追踪尾项待收束。
- 第五步：insights 仍有 “shareable report” 措辞，`generateUsageReport` 返回的 `facets` 在唯一调用处未消费；Bridge 底层尚待清理。
- 第六步：`analyzeContext.ts` 尚有过时的 Ant-only 注释；最终引用检查及完整手验说明仍待收束。

本阶段手动验收（由用户启动应用执行）：

1. 在交互命令列表确认 `/cost`、`/version`、`/bridge-kick` 不再提供，内置技能无 `/lorem-ipsum`；同名用户自定义技能不在本次删除范围。
2. 模型回复／工具执行中分别输入 `/model`、`/fast`、`/effort`，确认不再中途立即执行，当前轮结束后正常处理；空闲时仍可使用，fast 仍受原有可用条件限制。
3. 确认其他立即执行命令（如 `/exit`）行为未改变，状态栏成本统计仍正常，CLI `--version` 仍可显示版本。
4. Bridge 正常连接／重连和其他阶段完整交互验收继续留待最终验收，不以本次静态检查替代。

未运行构建，未执行 Git 提交／推送／合并，未修改用户历史配置或日志。

### 第三阶段：内部模型配置收尾（2026-11-21）

- `src/screens/REPL.tsx` 删除固定关闭的内部模型切换组件加载、可见状态、焦点对话框类型／选择分支及 JSX 回调；不修改普通 `/model` 或其他对话框。
- 删除无其他调用者的 `src/components/AntModelSwitchCallout.tsx` 空壳；`src/utils/model/model.ts` 删除内部代号保密提示及已无对象的导入排序标记。
- 保留 `modelCapabilities.ts` 通过 Models API 获取能力的独立机制，以及 effort 数值转换／描述：它们并非 antModels 实验配置或内部默认参数，本轮不扩大删除边界。普通模型能力判断、第三方覆盖保持原样。
- 扩展 `test-ant-feature-cleanup.mjs`，检查内部模型配置模块／组件文件不存在，遍历源码断言配置引用及 UI 状态／焦点入口均已删除。执行 `node test-ant-feature-cleanup.mjs` 通过；未构建、未启动应用、未执行 Git 写操作。
- 手验：启动应用后确认普通模型选择和 effort 提示仍正常，无内部模型切换弹窗；实际 API 模型切换由用户选择是否执行。

下一阶段从第四步追踪尾项开始，再处理第五步 Bridge 故障注入与 insights 收尾；此前记录的待办以本节和下方执行状态为准。

### 第四阶段：推测执行追踪收尾（2026-11-21）

- 核对 `startLLMRequestPerfettoSpan` 唯一外部调用点 `utils/telemetry/sessionTracing.ts`，未传入推测标记。
- `src/utils/telemetry/perfettoTracing.ts` 删除无调用者的 `isSpeculative` 可选参数及 `is_speculative` 输出字段；正常 API span、模型／token／消息／来源字段保留。不改写既有追踪文件或会话日志。
- 扩展 `test-ant-feature-cleanup.mjs`：遍历源码检查 speculation 与两种追踪标记不存在，检查推测模块已删除、正常追踪字段及 Bash 权限 `speculativeChecks` 保留。
- 执行 `node test-ant-feature-cleanup.mjs` 通过。普通输入建议接受／取消／编辑和旧会话恢复仍需用户手验，静态检查不替代运行验收。
- 本阶段未修改 Bridge 或 insights，未构建、未启动应用、未执行 Git 写操作。下一阶段为第五步 Bridge 故障注入和 insights 收尾。

### 第五阶段：Bridge 故障注入与 insights 收尾（2026-11-21）

- `src/bridge/replBridge.ts` 直接使用 `createBridgeApiClient`，删除故障注入包装、调试句柄注册／清理、`debugFireClose` 赋值和过时注释；删除专用模块 `src/bridge/bridgeDebug.ts`。
- 正常 `ReplBridgeHandle`、永久关闭处理、过时 transport 回调保护、轮询唤醒、序列号记录、重连和 teardown 保留。独立的 SIGUSR2 手动重连入口不依赖已删模块，本阶段不扩大删除范围。
- `src/commands/insights.ts` 将两处分享报告措辞改为本地报告；核对唯一调用点后，删除 `generateUsageReport` 未消费的 `facets` 返回字段／类型，保留 facets 分析及本地 HTML 写入。
- 核对 `apiMicrocompact.ts` 保留 `clear_thinking_20251015`，`betas.ts` 保留对应 context-management beta；源码已无 `clear_tool_uses_20250919`。insights 未检出 Homespace、SSH/SCP、上传和分享措辞。
- 扩展 `test-ant-feature-cleanup.mjs`，撤销 Bridge 文件残留豁免，遍历源码检查故障注入引用；新增正常关闭／重连、本地报告、thinking 策略及 beta 保留断言。执行 `node test-ant-feature-cleanup.mjs` 通过。
- 手验：用户启动 Remote Control，检查正常连接、收发和断线重连／退出；运行 `/insights` 确认本地 HTML 生成且无上传分享提示。以上均未在本阶段实际执行，可能涉及服务权限或真实 API。
- 未构建、未执行 Git 写操作、未修改历史日志或配置。下一阶段为第六步最终引用检查与手动验收清单收束。

### 第六阶段：最终检查与人工验收（2026-11-21）

- 最终定向只读审查未发现已删功能的有效入口、失效导入或相关专用环境开关遗漏。
- 清理 `analyzeContext.ts` 三处已开放明细的 Ant-only 注释，以及 `perfettoTracing.ts` 已删除推测标记的说明。
- 独立回归脚本新增实际 `getAPIContextManagement` 函数正文的七组逻辑检查，覆盖无 thinking、正常保留、只留最近一轮、redact 优先等分支；保留 max 持久化正文检查和全源码定向引用检查。
- 执行 `node test-ant-feature-cleanup.mjs` 全部通过。未构建、未启动 CLI、未执行真实 API 或 Git 写操作；全部人工项目仍未执行，不能将开发完成视为运行验收通过。

### 人工验收发现：max 重启丢失修复（2026-11-21）

- 用户实测：模型菜单设置 max 后当前会话显示 max，重启变为 auto。第一步遗漏了 `src/utils/settings/types.ts` 的 `effortLevel` schema：普通身份不接受 max，`.catch(undefined)` 会丢弃该值。
- 修复 schema 为所有身份接受 low／medium／high／max；不改变模型的 max 能力限制。此前静态检查仅覆盖转换函数，漏掉配置校验层，本次补充 schema 回归断言，`node test-ant-feature-cleanup.mjs` 已通过。
- 本次未读取或修改用户实际配置。需重启加载修复后执行 `/effort max` 重新写入，再退出重启执行 `/effort`；模型菜单设置 max 也需重新复验。旧版写入流程可能已丢弃该值，不能仅重启而不重新设置。
- 此问题说明此前自动通过不等于完整运行验收通过；max 人工验收仍待复测，其他人工项目状态不变。

### 人工验收发现：模型切换 effort 显示及范围调整（2026-11-21）

- 原代码只在菜单显示层把非 Opus 的 max 改为 high，实际选中／保存和 `/effort` 仍使用 max；请求解析又会将 max 降为 high，造成显示与提交不一致。
- 核对当前官方 effort 文档，Sonnet 4.6 已列为支持 max： https://platform.claude.com/docs/en/build-with-claude/effort 。此前“仅 Opus 4.6”的说明过时。
- 用户进一步明确选择“所有自定义模型也开放”：本节覆盖前文“不扩大 max 模型范围”的原边界。现在所有模型均提供 low／medium／high／max，取消客户端模型名单过滤、第三方 effort/max 能力覆盖拦截及 max→high 降档；是否支持交由上游校验，不自动重试或回落。
- `utils/effort.ts` 删除能力过滤函数与降档；`ModelPicker.tsx` 不再仅显示 high，状态与显示一致；API 请求原样转发字符串档位；SDK 可选档位、通知、帮助和提示同步更新。其他 thinking／上下文能力覆盖不变。
- 回归新增 Opus／Sonnet／Haiku／自定义模型四档不降级、环境变量优先级和 API 透传检查。静态／纯函数脚本通过；未调用真实 API、未构建。第三方返回不支持错误是本次允许的结果，不等同于所有模型官方支持 max。
- 复测：重启后 `/effort max`，依次切换 Opus、Sonnet、Haiku、自定义模型，每次比较菜单／确认提示（有 effort 后缀时）／`/effort` 均不再从 high 跳回 max；实际发送只读问题验证上游接受或明确报错，不应静默降成 high。若设置了 `CLAUDE_CODE_EFFORT_LEVEL`，它仍优先于菜单；菜单展示的是选择值，不代表环境覆盖已解除。

## 人工验收步骤

### 用户实际需要做的最小验收

只需先验证以下四项可观察行为，不需要逐项验证删除动作：

| 项目 | 操作 | 通过标准 |
| --- | --- | --- |
| max 保存 | `/effort max` → `/exit` → `bun run dev` → `/effort` | 重启仍是 max |
| 模型切换 | 从 Opus max 切到 Sonnet，再查看 `/effort` | 菜单／确认提示（有后缀时）与查询一致，不发生 high→max 跳变 |
| context 展示 | 请模型读取一个非敏感文件，然后 `/context` | 可以看到工具、系统提示、消息等有数据的明细，界面可正常退出 |
| 命令排队 | 模型正在做只读分析时输入 `/effort high` | 不在当前轮中途立即处理，结束后处理命令 |

只测这四项即可先反馈核心结果。下面保留详细操作供查阅，非交互 context、输入建议、旧会话、insights、Remote Control、thinking／压缩均为可选补充；无条件的项目直接跳过，不影响核心验收结论。

### 准备与执行原则

- 在仓库根目录使用当前源码启动，避免误测已安装的旧版 `ccli` 或已有 tgz。以下命令适用于项目已安装依赖、Bun 可用的终端，不需要构建。
- 普通身份使用 `USER_TYPE=external`。max 验收时确认 `CLAUDE_CODE_EFFORT_LEVEL` 未覆盖设置；先记录原 effort 值，测试后恢复。
- 使用非敏感会话。输入建议、模型回复、context token 分析、insights 和 Remote Control 可能使用真实 API／服务并产生费用；无权限的项目记录“阻塞／未验收”，不要记通过。
- 不删除历史配置或日志，不用故障注入命令，不通过真实 Git 提交验证成本统计。

### 1. 本地自动检查及版本（无需模型回复）

```bash
node test-ant-feature-cleanup.mjs
bun run src/dev-entry.ts --version
```

预期：脚本打印 PASS 并正常退出；CLI 输出版本，不启动模型对话。版本号以当前 package 为准，不要求固定值。

### 2. 普通身份、max 持久化与模型入口

```bash
USER_TYPE=external bun run src/dev-entry.ts
```

1. `/model` 选择实际支持 max 的模型（如 Opus 4.6）；执行 `/effort max`，预期成功设置，不出现“仅本次会话”提示。
2. 用 `/exit` 退出，执行相同启动命令。输入 `/effort`，预期仍显示 max；这一步才能证明跨进程保存。环境变量有覆盖时先解除本次测试的覆盖再验。
3. 在 `/model` 中从 Opus max 切到 Sonnet，比较菜单选中档位和 `/effort` 是否一致；不要求辨认原内部模型或证明旧弹窗不存在。Haiku／自定义模型可选测试，上游可能拒绝 max。
4. 记录并恢复原 effort 设置；原为自动则 `/effort auto`。不要用不支持 max 的模型 API 是否接受 max 来判定持久化功能。

### 不需要人工验收的删除项（开发侧检查）

以下由源码审查和 `node test-ant-feature-cleanup.mjs` 的定向检查负责，不要求用户在界面中证明“不存在”，也不要尝试调用已删除命令：

- `/cost`、`/version`、`/bridge-kick`、`/lorem-ipsum` 的注册和专用文件删除。
- 内部模型配置、切换 UI 空壳及其消费引用删除。
- 推测执行模块和专用追踪字段删除。
- Bridge 故障注入模块及接线删除。
- API 旧工具清理策略删除，thinking 策略保留。
- insights 内部远程扩展由定向源码审查检查；人工只需在愿意运行报告时验证本地生成功能。

这些检查是定向静态／纯函数检查，不代表完整运行验证或“绝对无网络上传”的证明。无需为删除项准备历史环境、内部账户或抓包。

### 4. 交互与非交互 context 明细

1. 在普通身份会话先请求读取一个无敏感信息的现有源码文件，让会话包含用户消息、模型回复和工具结果，再运行 `/context`。
2. 预期有 System tools、System prompt sections、Message breakdown 等明细，无 ANT-ONLY 标题；折叠／滚动和返回输入框正常。空类别可能不显示，不能要求每一类都有数据。
3. 退出后记录该会话 ID，使用实际 ID 执行（将 `<会话ID>` 替换后运行）：

```bash
USER_TYPE=external bun run src/dev-entry.ts --resume <会话ID> -p "/context"
```

预期文本含 System Tools、System Prompt Sections、Message Breakdown 中有数据的部分，无员工限制标题；这条命令是文本入口验收，不要求和交互 token 数完全一致。若现有账户不支持 token 分析则记录阻塞。

### 5. 模型设置命令等待当前轮结束

1. 在测试会话请求模型“只读查看几个源码文件并逐项说明，不修改文件”，运行中输入 `/effort high`。
2. 预期不会在当前轮中途立即改设置；当前轮结束后处理命令，随后 `/effort` 可确认新值。
3. 分别重做 `/model` 和 `/fast`（仅 fast 可用账户）。预期模型选择／fast 切换不打断当前轮，空闲时仍正常执行。不同时堆多个命令，以便定位问题。
4. 在独立测试会话验证 `/exit` 仍可在运行中退出，不必等待整轮；这会中断当前测试请求，勿在重要任务中操作。完成后恢复原模型／effort／fast 设置。

### 6. 普通输入建议与旧会话恢复

1. 在已启用普通输入建议的会话等待建议出现，按界面提示的接受／提交键操作。若接受键仅填入文本，再正式提交；若空输入框按 Enter 直接接受并提交，则预期直接开始正常回复。不出现后台推测结果接管或重复回复。
2. 建议出现时不接受，输入自己的文本并提交；再测试接受后修改文本再提交。预期建议可取消／覆盖、编辑内容不丢失，回复针对实际提交内容。
3. 若建议未生成，记录“未覆盖”，不要算通过；可检查现有建议开关，但本轮不恢复推测开关。
4. 通过 `/resume` 选择清理前已存在的会话（若有推测事件历史，优先该会话）。预期能恢复消息并继续正常对话，无未知旧事件导致的崩溃；没有这类历史时仅能验证普通旧会话恢复。

### 7. 本地 insights（可能产生多次模型请求）

1. 对允许分析的本地历史执行 `/insights`；数据不足时补充测试会话或记录未覆盖。
2. 预期分析完成、生成本地 HTML，提示本地文件链接和实际路径。Windows 若不能直接打开链接，用提示的 HTML 路径手动打开。
3. 报告有会话统计与分析内容；不要求与清理前结果逐字相同。无 Homespace／SSH 收集步骤、内部上传或远程分享链接提示。
4. “删除内部上传”不等于“完全离线”：正常分析仍可能调用模型 API，不以出现正常模型网络请求判定失败。

### 8. 正常 Remote Control（有服务权限时）

1. 在测试会话执行 `/remote-control`，按界面说明从另一设备连接。
2. 远端发送一条无副作用消息，确认本地接收、远端看到回复；再确认权限确认仍按原有流程处理。
3. 在允许短暂中断的测试网络中断开再恢复网络，观察正常自动重连／状态变化；恢复后再发送一条消息，预期无重复回复、会话仍可用。网络不能安全中断则将重连项目记未覆盖。
4. 正常退出会话，确认进程结束、无持续后台轮询；不使用已删除 `/bridge-kick`，Windows 不需要测试 SIGUSR2。
5. 功能因账户／服务端权限不可用时记录阻塞，不通过设置 USER_TYPE=ant 绕过服务权限。

### 9. Thinking 与压缩（真实 API 可选补充）

1. 使用支持 thinking 的模型做两轮只读问题，其中可包含一次文件读取。预期后续请求无未知 context-management 策略、beta 或 thinking 校验错误。
2. 如需验证客户端压缩，在非重要测试会话运行 `/compact`，完成后继续提问，预期可继续正常对话。
3. 无需为了本轮专门等待一小时或构造大量消息；“全部 thinking 保留／只保留最近一轮／redact 优先”已由轻量函数测试覆盖。普通两轮对话不能证明服务端所有策略分支均已验收。

### 验收结果记录

核心四项记录通过／失败及实际现象即可；可选项目记录通过／失败／跳过，不要求补齐特殊环境。问题截图或日志先脱敏，不包含 token、密钥和敏感历史。核心验收与可选功能验收分开给出结论，不能因为可选项跳过就声称它已通过；删除项由开发侧检查负责。

## 执行状态

- [x] 调查结论及用户选择已落盘。
- [x] 已确认删除整个 `/cost`，保留三个模型设置命令但取消运行中立即执行。
- [x] 第一步：开放 max 持久化与详细 context（纯函数／静态回归通过，交互待手验）。
- [x] 第二步：小型命令／技能入口和六个专用文件已删除；三个模型设置命令取消 immediate，通用机制保留；扩展静态回归通过，运行中排队及终端行为待手验。
- [x] 第三步：核心内部模型配置、消费和 REPL 切换 UI 空壳均已删除，源码引用回归通过；普通模型能力／第三方覆盖保留，交互待手验。
- [x] 第四步：推测执行主链路及 Perfetto 追踪尾项均已清理，源码残留检查通过；普通建议正常提交和 Bash 权限预检查保留。输入建议交互及旧会话恢复仍待用户手验。
- [x] 第五步：insights 内部扩展／分享措辞及未用返回值、Bridge 故障注入、API 工具清理策略均已清理；正常 Bridge、本地报告及 thinking 策略保留，静态回归通过，运行验收待用户执行。
- [x] 第六步：最终引用检查、过时注释清理、独立静态／纯函数回归及完整人工验收说明已完成；自动检查通过，人工运行验收尚未执行。
