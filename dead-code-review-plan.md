# 按 Git 提交追踪的死代码审查计划表

## 范围与状态约定

- 基准：2026-11-22，当前 HEAD 为 `0fba5d7`。
- 每个提交单独审查：对照父提交确认删除／替换范围，再追踪当前源码中的调用、状态写入与消费关系。
- 主表优先覆盖功能删除、裁剪及入口重构提交；不代表其余历史已经通过审查。纯新增、修复、文档、依赖及版本提交暂不逐项展开，后续发现关联删除时补录。
- **待审查**：仅依据提交主题安排检查点，尚未确认存在死代码。
- **处理中**：已开始审查，但仍有未闭环项。
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
| P1 | `f778ee1` | 移除部分 ant 内部功能 | 按 diff 分组追踪内部入口、状态、条件导入、提示词和清理链路 | 待审查 |
| P2 | `98f539b` | 移除 `/commit`、`/commit-push-pr` 与 `/verify` | 检查命令／技能专用提示词、注册、辅助模块及旧入口提示 | 待审查 |
| P1 | `cc1bf62` | 移除统计上传并使用纯本地功能配置 | 检查上传队列、配置缓存、实验查询、订阅通知和初始化；与 `3385a66`、`f4218d6` 交叉追踪 | 待审查 |
| P1 | `3385a66` | 移除远程埋点，仅保留本地错误日志 | 检查事件生产端、无消费者数据采集、客户端初始化、定时器、flush／shutdown 接线 | 待审查 |
| P1 | `6561d1b` | 移除 web-setup、设置同步和遥测开关 | 检查专用状态、配置字段、同步任务、分支及环境变量；与遥测删除提交交叉追踪 | 待审查 |
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

## 后续每个提交的审查步骤

1. 读取 `git show <提交>` 和父版本，明确实际删除内容，不仅依据提交标题。
2. 对照当前源码追踪导出、调用方、写入入口、读取消费者、注册及清理链路。
3. 区分本次删除造成的死代码、既有残留、功能开关固定关闭的路径，以及仅过期注释／source map。
4. 对无调用函数、只写不读状态、无写入状态和孤立模块形成明确删除边界；共享能力须列出保留理由。
5. 实施已确认清理，提供独立一键测试；不构建，不自动提交／推送。
6. 验证通过后将对应行标记为“已完成”，补记实际结果、保留边界及清理所在的提交或工作区状态。
