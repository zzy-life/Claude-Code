# 按 Git 提交追踪的死代码审查计划表

## 范围与状态约定

- 基准：2026-11-22，当前 HEAD 为 `0fba5d7`。
- 每个提交单独审查：对照父提交确认删除／替换范围，再追踪当前源码中的调用、状态写入与消费关系。
- 主表优先覆盖功能删除、裁剪及入口重构提交；不代表其余历史已经通过审查。纯新增、修复、文档、依赖及版本提交暂不逐项展开，后续发现关联删除时补录。
- **待审查**：仅依据提交主题安排检查点，尚未确认存在死代码。
- **处理中**：已开始审查，但仍有未闭环项。
- **调查完成／待清理**：只读调用链调查已完成并确认残留，尚未实施清理或验证；不等于“已完成”。
- **已完成**：已核查关联调用链，确认残留已处理或有明确保留理由，并完成适用的验证；不表示该提交涉及的所有功能都已运行验收。
- **重要：最近三个提交的清理已在当前工作区完成，尚未形成新的 Git 提交。“已完成”是审查／处理状态，不是提交状态。**

## 审查计划表

按提交时间从新到旧排列；P1 为删除范围较广的优先审查项，P2 为局部删除或行为替换项。

| 优先级 | 提交 | 改动主题 | 审查重点／处理结果 | 状态 |
|---|---|---|---|---|
| 已闭环 | `0fba5d7` | 移除废弃桩命令及注册引用 | 已清理 `/env` 空状态链路、手动记忆提取、孤立自动反馈及限额模拟；移除失效提示。底层真实功能按调用链保留，详见下文 | **已完成** |
| 已闭环 | `cd73a4b` | 移除 DevBar 与员工 API 指标追踪 | 已清理失去消费者的每轮统计、累加／reset 接线、配置写盘计数和废弃阈值；保留真实耗时、日志及历史消息兼容 | **已完成** |
| 已闭环 | `f4218d6` | 移除 Gates 与本地特性覆盖 | 已核查覆盖字段、订阅和导航无有效残留；压实 Settings 缓存空槽；保留仍有消费者的默认值查询接口 | **已完成** |
| 已闭环 | `b1ca0f7` | 移除 `/stuck` 内置诊断技能 | 专用提示词及注册已完整删除，未发现新增死代码；另发现更早移除 `/issue`、`/share` 后留下的失效提示，归入 `f778ee1` 后续处理 | **已完成** |
| 已闭环 | `2ce8178` | 移除 Computer Use 及依赖空壳 | 已在工作区删除 `ToolUseContext.sendOSNotification` 类型及 REPL 回调赋值，独立静态回归通过；专用删除闭环，Chrome／通用 MCP 保留 | **已完成** |
| 已闭环 | `4f3eb26` | 移除 undercover 与自动提交署名 | 已在工作区清理仓库分类、既有模型名称清洗死分支、失效署名配置及说明，并修正关联注释；独立静态回归通过，贡献追踪及正常 Git 提示保留 | **已完成** |
| 已闭环 | `f229ef9` | 精简命令入口并统一 effort 判断 | 已在工作区移除 effort 无消费类型成员、三档循环与冗余缓存、旧 callout 字段及局部命令死分支，修正说明；独立回归通过，共享成本／Bridge／effort 链路保留 | **已完成** |
| 已闭环 | `f778ee1` | 移除部分 ant 内部功能 | 已清理无生产者权限标记及既有 insights 导出、空横幅、恒假 ccshare 分支与失效引导；共享权限与报告保留 | **已完成** |
| 已闭环 | `98f539b` | 移除 `/commit`、`/commit-push-pr` 与 `/verify` | 已清理贡献统计结果生成及 generatedFiles 死链、过期命令文档；贡献追踪恢复及自定义技能保留 | **已完成** |
| 已闭环 | `cc1bf62` | 移除统计上传并使用纯本地功能配置 | 已清理用户资料预取与无入口问卷；Git email、SkillImprovement 校验、默认值接口和用户 OTEL 保留 | **已完成** |
| 已闭环 | `3385a66` | 移除远程埋点，仅保留本地错误日志 | 已清理确认的文件哈希、启动／上下文采集、缓存统计、成功事件附加信息和孤立元数据富集；不扩大到所有空埋点 | **已完成** |
| 已闭环 | `6561d1b` | 移除 web-setup、设置同步和遥测开关 | 同步主体无残留；已清理后续变恒假的 token-sync 分支及共享遥测孤儿仓库哈希；实际远程 App 检查保留 | **已完成** |
| P1 | `e07fd2d` | 移除云端深度规划 ultraplan | 检查命令、云端任务、审批／恢复、UI 状态、提示词和清理接线 | 待审查 |
| P2 | `2fc5a7c` | 收敛 Haiku 模型选项 | 检查旧模型入口、选项转换、别名和条件判断；不据名称删除仍用于历史配置的解析 | 待审查 |
| P1 | `76a80a8` | 移除 buddy 电子宠物 | 检查持久化字段、定时器、UI、生成／展示辅助函数和资源引用 | 待审查 |
| P2 | `bf26954` | 优化 Agent 工作树移除逻辑 | 检查旧清理分支和辅助函数，保留安全校验及已有工作树兼容 | 待审查 |
| P2 | `1dceb42` | 优化计划模式权限及工具注入 | 检查旧权限分支、重复工具注入、策略辅助函数和上下文状态 | 待审查 |
| P2 | `1c12e86` | 引入延迟工具摘要与暴露策略 | 检查旧工具列表生成／缓存及摘要路径；保护 Prompt Cache 和动态工具暴露语义 | 待审查 |
| P2 | `c068397` | 移除团队模式实验开关 | 检查旧 gate 查询、分支、配置及提示词残留；保留 `/team` 显式控制链路 | 待审查 |
| P2 | `0151e68` | 移除 OverflowTestTool | 检查工具实现、注册、权限表、提示词、类型及专用资源 | 待审查 |
| P2 | `57473d6` | 移除 TungstenTool 并调整 tmux 隔离 | 检查专用工具接线及 tmux 旧分支；区分仍有效的终端／工作树隔离 | 待审查 |
| P2 | `e9ecfec` | 调整 Agent 工作树清理与遗留工作树支持 | 检查被替换的元数据处理和清理辅助函数；不得绕过防误删判断 | 待审查 |
| P2 | `9bcc4e5` | 移除 REPL 问卷及自动 `/issue` 逻辑 | 回查其他专用问卷／自动反馈残留；`autoRunIssue.tsx` 已在本轮清理，不等于整个提交已审查 | 待审查 |
| P2 | `f4193d5` | 移除编辑工具提示中的内部用户条件 | 检查旧提示词构造参数、条件和专用导出；保留正常编辑授权 | 待审查 |

## 最近三个提交：完成记录

### `0fba5d7` — 桩命令关联残留

**处理内容**

- 删除 `src/utils/sessionEnvVars.ts`，清理 Bash／PowerShell 读取和 `/clear` 清空接线；正常环境变量与沙箱临时目录机制保留。
- 删除 `manuallyExtractSessionMemory()`、`ManualExtractionResult` 及专用导入；保留自动记忆接线、记忆压缩和历史消息局部总结。
- 删除孤立的 `src/utils/autoRunIssue.tsx`；正常 `/feedback`、`/bug` 及问卷链路不在此删除范围。
- 删除 `src/services/mockRateLimits.ts`、`src/services/rateLimitMocking.ts` 及套餐、账单、响应头覆盖和专用调用判断；真实服务端 429、重试与订阅判断保留。
- 删除指向 `/reset-limits` 的失效提示。

**归因边界**

- 命令提交前已经是禁用 stub，所以上述多数残留早已失去入口，并非删除 stub 才变死。
- `CLAUDE_MOCK_HEADERLESS_429` 原先仍可触发，不属于死代码；此次经用户单独确认，一并移除该内部测试能力。
- 自动记忆仍保留接线，但当前 `tengu_session_memory` 查询默认返回 `false`，不能把接线保留描述为当前自动提取已启用。

### `cd73a4b` — 性能 UI 删除后的统计残留

**处理内容**

- 删除每轮 Hook／工具／权限分类器的耗时、次数、读取函数、累加与 reset 接线。
- 删除全局配置写盘次数计数器、读取接口及废弃展示阈值。
- 保留 `addToToolDuration()` 的会话总耗时分支、成本展示消费者、通用 Hook 观测、慢操作日志、API TTFT 元数据及旧 `api_metrics` 消息过滤。

**归因边界**

- 每轮统计与配置写盘次数的唯一 UI 消费者由该提交删除，属于新产生的无消费统计链。
- 展示阈值在该提交前就已无使用，属于顺带确认并清理的旧残留。

### `f4218d6` — Gates 删除后的缓存残留

**处理内容**

- Settings 缓存从 25 槽压实为 22 槽，移除三个空置位置并同步重编号。
- 已核查 Gates 的覆盖读写、订阅、导航和配置字段，无新增孤立业务函数需要删除。
- 保留 `growthbook.ts` 的默认值查询接口：它们仍有业务消费者，不因返回默认值而整体判为死代码。

## 验证记录

以下检查已在本轮清理后通过；均不涉及构建或真实 API 请求：

```bash
node test-no-orphaned-internals.mjs
node test-no-employee-perf-ui.mjs
node test-no-feature-overrides.mjs
node test-no-stub-commands.mjs
node test-summarize-up-to.mjs
git diff --check
```

只读差异复核未发现悬空引用、误删真实 429／压缩链路或 Settings 缓存索引碰撞。静态回归不替代完整终端运行验收。

## `b1ca0f7` 与 `2ce8178`：审查及清理记录

首次仅作只读审查；随后按用户要求清理 `2ce8178` 的两处通知接线并运行独立静态测试。以下结论不替代运行验收；未构建、未提交。

### `b1ca0f7` — 未发现新增死代码

- 提交完整删除 `src/skills/bundled/stuck.ts` 及注册入口；当前源码无 `STUCK_PROMPT`、`registerStuckSkill` 或 `/stuck` 引用。
- 原文件只有技能注册和提示词；进程扫描、堆栈采样及 Slack 上报是提示词指令，不存在待清理的专用 TypeScript 实现。
- `/debug`、`diagLogs.ts`、正常反馈日志、heapdump 及安装／IDE 诊断仍有独立消费者，保留。
- 另发现 `src/constants/prompts.ts:236–239` 的内部反馈提示仍推荐 `/issue` 和 `/share`；这两个内置入口早在 `f778ee1` 被移除，提示在本提交父版本已存在。属于既有失效提示，纳入 `f778ee1` 后续审查，不归因于 `/stuck` 删除。

### `2ce8178` — 孤立通知接线已清理（当前工作区）

- 已删除审查时位于 `src/Tool.ts:210–214` 的 `ToolUseContext.sendOSNotification` 声明，以及 `src/screens/REPL.tsx:2374–2376` 的同名回调赋值。
- 父版本的仅有消费者是 `computerUse/wrapper.tsx` 获取锁后的进入通知，以及 `computerUse/cleanup.ts` 释放锁后的退出通知；两者均随本提交删除。清理前仅剩声明与赋值，无读取或调用。
- 仅删除以上接口属性和赋值；保留空闲和超时使用的 `sendNotification`、其导入及 `terminal`。MCP elicitation 实际调用的是 `executeNotificationHooks`，也未改动；修正此前把两者混称的记录。
- 新增无外部依赖测试 `test-no-computer-use-notification.mjs`，验证接线消失及上述正常通知消费者保留；`node test-no-computer-use-notification.mjs` 与 `git diff --check` 已通过。
- 已核查专用授权 UI、应用／截图／显示器状态、回合结束及中断清理、锁和热键、三个 `@ant/computer-use-*` shim 与依赖声明，未发现其他专用可执行残留。
- Chrome 仍使用 `InProcessTransport`、进程内服务器生命周期及专用工具渲染；通用 MCP 启用／禁用、`setToolJSX` 与 `registerCleanup` 也有真实消费者，保留。
- 归因限定：父版本 Computer Use 已依赖空壳实现，不能声称此前功能实际可用；本提交删除最后静态消费者后，通知接线成为明确无消费残留。默认关闭与空壳不可用分开判断。

## `4f3eb26` 与 `f229ef9`：审查及处理记录

首次对这两个提交仅审查，随后按用户要求先后完成 `4f3eb26` 和 `f229ef9` 清理，均位于当前工作区，未提交。下列发现定位行号对应清理前审查时源码。

### `4f3eb26` — 仓库分类及署名配置残留已清理（当前工作区）

**实施与验证**

- 已删除下述仓库分类分支、模型名称清洗死分支及专用导入。
- 已删除 Settings Schema 的 `attribution`、`includeCoAuthoredBy` 字段及技能配置说明，不新增兼容空壳或配置迁移；历史文件中的旧键不再是受支持的配置项，未改写用户配置文件。
- 通用布尔校验示例改用仍有效的 `includeGitInstructions`；修正 bare 模式注释并删除指向不存在 trailer 模块的注释。
- 保留贡献追踪状态、快照、Git 状态检查、正常 Git 工作流提示及共享辅助函数；既有缺失 `attributionHooks.ts` 问题单独保留，不扩大本次清理范围。
- 新增一键静态测试 `test-no-undercover-attribution.mjs`，递归检查有效源码无已删除符号、Schema 与说明无失效字段，并核查共享接口保留。
- `node test-no-undercover-attribution.mjs`、`node test-no-computer-use-notification.mjs` 与 `git diff --check` 已通过。未构建、未提交。

**以下为清理前发现及归因（已按上文处理）**

**本提交导致的残留**

- `src/utils/commitAttribution.ts:29–112`：`INTERNAL_MODEL_REPOS`、`repoClassCache`、`isInternalModelRepo` 已失去消费者。父版本调用来自 setup 预热、REPL 提示及增强 PR 署名，本提交均已删除。建议删除这条分类分支和专用的 `getRemoteUrlForDir`、`sequential` 导入；保留同文件仍被使用的 `resolveGitDir`、贡献状态及文件追踪能力。
- `src/utils/settings/types.ts:336–365`：普通用户 `attribution.commit/pr`、`includeCoAuthoredBy` 配置仍被 Schema 接受，但读取它们的 `getAttributionTexts` 与 Bash 署名注入已经删除，当前没有行为消费者。`src/skills/bundled/updateConfig.ts:66–75` 仍指导配置，`src/utils/settings/validationTips.ts:93` 仍以旧字段举例。这不是 Undercover 专属配置；若继续坚持不支持自动署名，应删除字段和说明，通用布尔校验提示仅替换示例，不整条删除。是否保留旧配置兼容需在清理时明确，不能描述为功能仍有效。

**此前既有残留／注释**

- `src/utils/commitAttribution.ts:114–151`：`sanitizeSurfaceKey` 无调用，`sanitizeModelName` 仅被前者调用；父版本的额外消费者 `getEnhancedPRAttribution` 也无外部入口，属于既有不可达分支。
- `src/setup.ts:336–341` 的 bare 模式注释仍提仓库分类；`src/utils/commitAttribution.ts:820–821` 声称 trailer 已迁至不存在的模块。仅修注释，不作为可执行死代码。
- Undercover 模式、环境变量及 UI 删除闭环。保留正常 Git 工作流提示开关、远程会话 URL、贡献状态／快照及共享 Git 辅助函数。
- 另发现部分 `COMMIT_ATTRIBUTION` 接线指向缺失的 `attributionHooks.ts`，父版本已经如此；不归因于本提交，不据此整块删除贡献追踪，需另案核查。

### `f229ef9` — effort 残留已清理（当前工作区）

**实施与验证**

- 删除 `'effort'`、`'max_effort'` 能力类型成员，保留 thinking 等实际使用的覆盖机制。
- ModelPicker 固定四档双向循环，删除 `includeMax` 参数、`focusedSupportsMax` 和冗余缓存依赖；缓存由 82 槽压实为 80 槽，保留无有效焦点时的判断。
- 删除三个既有 `modelSwitchCallout*` 配置类型字段，不迁移或改写用户配置。
- 局部 `setEffortValue` 参数收窄为 `EffortLevel`，直接持久化具名档位，删除无入口的 session-only 分支；保留写盘失败处理、环境覆盖提示和 auto/unset。
- 收窄通知文本返回类型，修正设置同步与即时命令示例；不改 PromptInput brief 模式、数字 effort、环境解析或 API 行为。
- 新增独立测试 `test-no-obsolete-effort-paths.mjs`（Node 24，无外部依赖）：抽取实际纯函数执行，覆盖四档双向循环、缓存索引连续性、命令四档写入、auto/unset、环境冲突及写盘失败。设置写入使用测试替身，不修改真实用户配置。
- 该测试、此前两个清理测试及 `git diff --check` 均通过；Node 的类型擦除 API 有实验性提示，不影响测试通过。未构建、未提交。

**以下为清理前发现及归因（已按上文处理）**

**本提交导致的残留**

- `src/utils/model/modelSupportOverrides.ts:4–9`：`ModelCapabilityOverride` 的 `'effort'`、`'max_effort'` 成员失去消费者。当前查询调用仅使用 thinking、adaptive_thinking、interleaved_thinking；只删两个类型成员，保留模块和环境变量解析机制。
- `src/components/ModelPicker.tsx:150–153,190–193,432–433`：`focusedSupportsEffort` 和 `focusedSupportsMax` 同为 `Boolean(focusedModel)`；无有效焦点时直接返回，所以 `cycleEffortLevel` 的第三参数恒为 true，三档数组分支不可达。建议固定四档并移除第三参数、专用 `focusedSupportsMax` 计算及缓存依赖；保留有效焦点判断，不能连带删其 false 分支。

**此前既有残留／注释**

- `src/utils/config.ts:389–391` 的三个 `modelSwitchCallout*` 字段当前只有声明；父版本对应组件早已是空壳，属于既有残留。
- `src/commands/effort/effort.tsx:16–54,107–117`：局部设置函数只有四种具名档位入口，因此不可持久化分支与 session-only 后缀原先就不可达。只可局部简化，不能删除 CLI／环境变量的全局数字 effort 支持。
- `src/utils/settings/applySettingsChange.ts:83` 的非员工 max 示例、`src/screens/REPL.tsx` 的即时 `/model` 示例已过时；保护会话 effort 的逻辑及通用即时命令机制仍使用，保留。
- `src/components/EffortIndicator.ts:19` 的返回类型仍含 undefined，但函数已总返回字符串；可收窄签名，不能删除 PromptInput 在 brief 模式主动产生 undefined 的判断。ModelPicker 内联 source map 的旧源码不算运行时残留。

**已核查并保留**

- `/cost`、`/version`、`/bridge-kick`、lorem-ipsum 的专用实现及注册均删除闭环；成本退出 hook、消费阈值对话框、Bridge 关闭／重连与 transport 状态仍有生产消费者。
- effort 初始化、命令及模型选择写入、设置变更同步、API 请求和 SDK 展示链路仍完整，不扩大删除默认值、数字值、持久化及环境覆盖。
- SIGUSR2 在 Windows 不启用，但其他平台仍条件可达；数字 effort 和 ultrathink 也不能仅凭当前环境关闭就判死代码。

## 五个提交：调查及清理记录（2026-11-22）

调查基准为 HEAD `ad2f1d1` 及现有工作区。首次只读调查对照了各提交完整 diff、必要父版本和当时引用链；随后按用户要求实施清理。以下调查发现中的行号均为清理前定位，不代表这些残留仍存在。

### 实施记录（当前工作区，未提交）

- 删除 `requireCanUseTool` 无生产者接线、贡献统计结果生成链和 generatedFiles 模块、insights 孤立结构化导出、空 IssueFlagBanner 及专用扫描 hook／图标、恒假 ccshare 恢复分支。
- 删除文件操作哈希埋点模块及三个文件工具接线、上下文指标函数和启动调用、启动遥测／gh auth 探测、配置命中统计和损坏配置的纯事件备份探测、默认 Statsig 启动抽样、无入口事件元数据富集及仓库哈希闭包。工具成功事件的官方空埋点及专用附加信息已删除；因此失去唯一调用者的 Bash 扩展名采集 helper 也已删除，仍被 FileRead 使用的扩展名 helper 保留。
- 删除用户资料／email 预取，保留 getGitEmail 并将认证变化缓存重置收窄到该实际缓存。删除无入口问卷组件、hooks、状态机、View 私有 UI 和专用输入 debounce；保留 SkillImprovementSurvey 使用的响应类型与输入校验。
- 删除 token-sync 恒假检查及类型成员；保留实际远程访问和 GitHub App 检查。移除失效命令引导及两行过期内置命令文档。
- 末轮只读复核未发现功能回归；补删恒假分支移除后孤立的 `sessionStorage.ts` 中 `loadTranscriptFromFile`，以及问卷专用 `FeedbackSurveyType`。底层 transcript 加载／会话恢复函数和共享 `FeedbackSurveyResponse` 保留，新增测试已覆盖两项符号无残留。
- 保留文件操作结果与行数统计、Hook allow 后的 deny/ask 规则、贡献状态追踪／恢复、HTML insights、普通 resume、用户 OTEL 和本地错误日志、显式启动 profiling、企业设置及远程会话链路。
- 新增 `test-dead-code-cleanup.mjs`，无外部依赖，常量在顶部；递归扫描残留与已删模块，并抽取实际函数验证权限决策、快照恢复、问卷输入校验、显式／默认 profiling 行为。Node 24 的类型擦除 API 会输出实验性提示，不影响测试通过。

**验证记录**

已通过以下独立回归与差异检查，未构建、未调用真实 API：

```bash
node test-dead-code-cleanup.mjs
node test-no-undercover-attribution.mjs
node test-no-computer-use-notification.mjs
node test-no-obsolete-effort-paths.mjs
node test-no-employee-perf-ui.mjs
node test-no-feature-overrides.mjs
node test-no-stub-commands.mjs
node test-no-orphaned-internals.mjs
node test-summarize-up-to.mjs
git diff --check
```

人工验收：读取／编辑／写入文件正常；工具权限确认及 deny/ask 规则正常；`/insights` 生成本地 HTML；普通 session resume 正常。用户 OTEL、显式启动 profiling、远程任务与 SkillImprovementSurvey 仅在具备相应环境时选测。上述静态和抽取函数验证不代替完整终端运行验收。

**以下保留原调查归因与最小边界，清理结果以上述实施记录为准。**

### `f778ee1` — 内部功能删除

**确认由本提交留下的死接线**

- `src/Tool.ts:240`、`src/utils/forkedAgent.ts:298,456`、`src/services/tools/toolHooks.ts:345,356`：`requireCanUseTool` 仅剩类型、透传和读取，没有赋值生产者。父版本唯一明确的 `true` 赋值在本提交删除的 `PromptSuggestion/speculation.ts:636`。可删除该字段及条件中的对应子项，必须保留 `requiresInteraction && !interactionSatisfied` 和正常权限检查。

**相邻既有残留，不归因于本提交**

- `src/commands/insights.ts:2324–2398`：`InsightsExport` 和 `buildExportData` 当前及父版本均无外部调用。可删除这段结构化导出；本地 HTML 报告仍使用 facets、聚合和分析，不能整条删除。
- `src/components/PromptInput/IssueFlagBanner.tsx:9–10` 无条件返回 null，但 `src/screens/REPL.tsx:1630,4625` 仍计算／渲染，`src/hooks/useIssueFlagBanner.ts:92–132` 仍有扫描和触发状态。父版本已经如此。可删除两个专用文件及 REPL 接线；`src/constants/figures.ts:31` 的 `FLAG_ICON` 也只有该空组件导入。
- `src/main.tsx:3511–3518`：ccshare 恢复入口位于 `"external" === 'ant'` 恒假分支内，条件导入指向不存在的 `ccshareResume.js`。属于既有不可达残留，不是正常启动必然报错；普通 resume 链必须保留。
- `src/constants/prompts.ts:236–240`、`src/services/api/errors.ts:686–694` 仍引导 `/issue`、`/share`；这些入口父版本已是禁用 stub，后续 `0fba5d7` 才物理删除，属于既有失效引导，不是无引用函数。`FeedbackSurvey.tsx:122` 也有 `/issue` 文案，但组件当前已无入口，不能描述为仍会展示给用户。

**保留边界**：普通 prompt suggestion、无转录 fork、文件状态合并、API thinking 上下文管理及 Bash 权限 `speculativeChecks` 都有独立消费者，不随推测执行删除。内部模型切换及相关字段已由后续提交清理，不重复列为当前待删项。

### `98f539b` — 内置 Git 命令与 verify 技能删除

- 注册及专用模块删除完整；`attribution.ts` 等当时遗留的增强 PR 链已由后续 `4f3eb26` 删除，不能重复报告为当前残留。
- **明确死链**：`src/utils/commitAttribution.ts:408–603` 的 `calculateCommitAttribution` 当前只有定义；`:611–672` 的 `getGitDiffSize`、`isFileDeleted` 仅供其使用，`:57–84` 的结果类型同属该链。`src/utils/generatedFiles.ts:85–126` 的 `isGeneratedFile` 唯一外部消费来自这条死链。父版本链头为 `commit-push-pr → getEnhancedPRAttribution → getPRAttributionData → calculateCommitAttribution`，由本提交切断。可删除结果生成链及专用 generatedFiles 模块，不能整删仍有状态／快照／恢复消费者的 commitAttribution 模块。
- `src/utils/commitAttribution.ts:677–695` 的 `getStagedFiles`、`src/utils/generatedFiles.ts:134–136` 的 `filterGeneratedFiles` 在父版本就没有调用，单独归为既有孤立导出。
- `docs/05-hidden-commands.md:37–38` 仍将 `/commit`、`/commit-push-pr` 列为内部内置命令；本提交删除注册后文档失效。
- **保留**：`init.ts` 的项目自建 `/verify`、`insights.ts:1214–1216` 先创建技能再运行 `/commit` 的示例、SkillTool 自定义技能能力、Bash 正常 Git 指引及共享 Git／shell 辅助函数。不能按命令名批量删除。SkillTool 的 commit 示例没有声明内置属性，不列为确定死代码。

### `3385a66` — 官方埋点出口删除，采集生产端仍有残留

当前 `src/services/analytics/index.ts:12–20` 的 `logEvent`／`logEventAsync` 为空实现。原 Datadog／1P sink、队列、重试、timer、初始化和官方退出冲刷已删除；但调用空函数前的参数计算和前置异步采集仍会执行。

**仍执行、结果仅交给空埋点的链路**

| 位置 | 证据与最小边界 |
|---|---|
| `src/utils/fileOperationAnalytics.ts:9–70` | 路径／内容 SHA256 仅供事件；调用在 FileReadTool `:855,872,910,992,1060`、FileWriteTool `:392,416`、FileEditTool `:542`。可删专用模块和埋点调用，保留真实文件操作 |
| `src/utils/api.ts:479–562`，`src/main.tsx:2454` | `logContextMetrics` 预取 MCP、上下文／工具、目录计数及 token 估算后仅埋点。可删专用函数与接线，底层共享能力逐项保留 |
| `src/main.tsx:305–319,2982` | 启动探测采集 Git、worktree、gh auth、证书信息后仅埋点；`getCertEnvVarTelemetry`、`getGhAuthStatus` 专用消费也可随链清理 |
| `src/utils/config.ts:829–848,995,1002` | 缓存命中计数、比率计算及专用 cleanup 注册无实际消费者；配置缓存本体保留 |
| `src/services/tools/toolExecution.ts:1351–1405` | 扩展名和官方事件附加 metadata 失去消费者；必须逐字段排除仍被 OTEL 使用的数据，不可整段机械删除 |
| `src/utils/startupProfiler.ts:28–36,65–74,159–193` | Statsig 抽样触发性能标记和汇总后仅埋点；保留用户显式启用的详细本地 profiling |

这些生产端父版本均存在并由原上传链消费，归因于本提交删除出口后未收尾。此表是已确认的专用链，不表示已逐条穷尽全仓库所有空 logEvent 实参。

**已无入口的闭包**

- `src/services/analytics/metadata.ts:391–710` 中 `getEventMetadata`、环境／进程类型和私有富集 helper 仅在闭包内互相引用；总入口当前无调用，父版本仅 Datadog 和 1P logger 调用。可删除专用富集闭包、CPU 差分状态及对应导入；不能删除整个 metadata 模块，工具脱敏及输入提取仍供 OTEL 等使用。
- `src/utils/git.ts:329–338` 的 `getRepoRemoteHash` 仅供上述死入口使用，`:283–321` 的 `normalizeGitRemoteUrl` 又仅供该哈希函数使用，可收掉该闭包及专用 createHash 导入。它们在 `6561d1b` 删除同步时仍有遥测消费者，真正最后失去入口在 `3385a66`。
- `src/utils/config.ts:1424–1433` 的 `.backup` 探测仅构造已被丢弃的事件字段；可删专用探测。不能删除配置损坏备份、本地 logError 和用户错误提示。`:1413–1436` 的递归采样说明、`src/setup.ts:364` 的 analytics sinks 注释已过时。

### `cc1bf62` — 官方指标与远程配置删除

- BigQuery exporter、官方五分钟 reader、pendingExports、metrics opt-out 缓存／接口已删除，没有发现官方上传 timer 或退出冲刷仍有接线。
- GrowthBook 远程求值、缓存、初始化和刷新在本提交删除；本地覆盖和刷新订阅后来由 `f4218d6` 删除。当前 `growthbook.ts:1–54` 直接返回调用方默认值，无缓存、订阅或 timer，不应描述为仍支持本地覆盖。
- **明确死预取链**：`src/main.tsx:402 → src/utils/user.ts:52–59 initUser → getEmailAsync → cachedEmail`。`:77–127` 的 `getCoreUserData` 当前只有定义和清缓存引用，已无实际调用。父版本最后消费者为 `growthbook.getUserAttributes → getUserForGrowthBook → getCoreUserData(true)`，由本提交删除。可删除用户资料构造、email 预取及启动接线；保留 `getGitEmail`（`exampleCommands.ts:93` 使用），`resetUserCache` 只能收窄，不能直接整删共享缓存重置。
- **无入口问卷组**：`components/FeedbackSurvey/` 的 `useFeedbackSurvey.tsx:35`、`useMemorySurvey.tsx:43`、`usePostCompactSurvey.tsx:32`、`useSurveyState.tsx:10–49` 与 `FeedbackSurvey.tsx:17` 当前均无外部入口。三个 survey hook 父版本已无入口；组件最后的 REPL frustration wrapper 接线由本提交删除。感谢提示 timer 只有 hook 被执行才创建，不能称为仍在后台运行。
- 问卷可单独清理，但不能整目录删除：`SkillImprovementSurvey.tsx:7–8`、`useSkillImprovementSurvey.ts:2` 仍使用 View 导出的校验与响应类型。若删除无入口 View 组件，须保留这些共享导出，并复核专用 debounce hook。

### `6561d1b` — 设置同步主体删除完整，跨提交残留需分开归因

- 当前无用户设置上传／下载入口、同步 downloadPromise、专用同步键、cache-breaker 注入状态或 coworker／memory-shape 遥测实现。对应初始化、下载等待、reload 与清理接线已随提交移除。
- **后续才变死的 token-sync 分支**：`src/utils/background/remote/preconditions.ts:164–211` 的 `checkGithubTokenSynced` 唯一调用位于 `:228–233`，由 `getFeatureValue_CACHED_MAY_BE_STALE('tengu_cobalt_lantern', false)` 短路门控。当前默认值接口恒返回 false，因此不可达。可删除专用函数、门控分支、`:213` 的 `'token-sync'` 类型成员和专用 import／注释；保留 GitHub App 检查、`checkRepoForRemoteAccess`（scheduleRemoteAgents 仍调用）及返回结构。
- 不能把 token-sync 直接归因于 `/web-setup` 删除：`6561d1b` 有意保留远端凭据状态检查；`cc1bf62` 当时仍允许本地覆盖，直至 `f4218d6` 才确定不可达。
- 仓库哈希孤儿链与 `3385a66` 共用一条清理项，不重复计数。`6561d1b` 当时保留它有充分理由。

### 五项共同保留边界与后续范围

- 用户显式配置的 OTEL instruments／exporter、provider、forceFlush／shutdown 仍有完整消费者；不能等同于已删除的官方 Datadog、1P 和 BigQuery 出口。
- 本地错误日志的启动队列、buffered writer timer 和 cleanup 仍用于本地落盘；CCR／HybridTransport 的上传队列承担远程会话交付，也不是旧统计上传。
- 企业托管设置／策略轮询、正常设置缓存与变更监听、远程会话／GitHub App 检查仍有业务消费者，保留。
- 默认值 gate 中仍有有效业务默认行为（语音、文件大小限制、Bridge 轮询等）。不批量删除 gate 调用；恒假分支仅在逐条核查后清理。
- 旧配置 JSON 中可能仍保存已失效键，但当前无读取消费者；这不等于仍有活动同步／远程缓存，也不在本次调查中迁移用户配置。
- 上述建议已按用户要求实施，独立测试见实施记录；调查时的原始归因仍保留，不扩大为全仓库所有空埋点和所有固定 gate 的全面清理。

## 后续每个提交的审查步骤

1. 读取 `git show <提交>` 和父版本，明确实际删除内容，不仅依据提交标题。
2. 对照当前源码追踪导出、调用方、写入入口、读取消费者、注册及清理链路。
3. 区分本次删除造成的死代码、既有残留、功能开关固定关闭的路径，以及仅过期注释／source map。
4. 对无调用函数、只写不读状态、无写入状态和孤立模块形成明确删除边界；共享能力须列出保留理由。
5. 实施已确认清理，提供独立一键测试；不构建，不自动提交／推送。
6. 验证通过后将对应行标记为“已完成”，补记实际结果、保留边界及清理所在的提交或工作区状态。
