# 审批只判断动作：修正方案

## Context

用户明确修正 precious-crafting-pony.md 的原四态/根轮停止设计：审批模型只判断当前动作是否允许执行，不决定任何代理是否结束任务。拒绝仅返回当前动作的错误和原因，不停止主代理、子代理、兄弟代理或正在执行的后台命令。子代理收到原因后可自行改命令；主代理也必须能收到原因并决定是否调整任务。所有新动作仍走既有权限检查，拒绝回传不是授权或绕过规则。

此次同时修复路径规范化与收据冲突、审批上下文图片泄漏。用户已接受本地命令输出现状、跨轮问答不作为专用授权及退出 plan 后手动重新进入 bypass，不修这些项。动态目录约束目前只解释机制，不纳入修改。ant 环境限制不改。

## 1. 收敛审批协议，不再包含任务停止决定

修改 `src/types/permissions.ts`、`src/utils/permissions/autoApproval.ts`、`autoApprovalPrompt.ts`：

- 审批业务决定仅 `allow` 与 `deny`；deny 包含简短英文 reason。去掉 hard_deny/retryable_deny 及 saferAlternative 分档，不让审批模型规划任务或决定代理生命周期。
- 保留 `needs_user` 作为不能作出自动授权决定的人工出口；它不是任务停止决定。超时、错误、未知模型、schema 不支持仍走现有权限弹窗，绝不自动放行。
- allow 仍静默，只准原样输入一次。deny 返回普通 PermissionDecision deny 和明确原因，不 abort、不杀任务、不触发全轮锁定。
- 去掉“连续三次拒绝转人工”的审批模型调度逻辑，防止多个代理共享拒绝计数相互影响；是否重试由实际代理决定，新输入重新审查。
- 普通文字保留为任务意图与约束，不算专用工具权限批准；本地命令输出现状不改。AskUserQuestion 不再记录为专用授权来源；完整问答单列非授权 taskAnswers，可限制任务但不授予权限，写入后使在途旧审批失效。专用批准只来自已有工具权限弹窗/审批通道，不新建授权工具，也不新增 SDK 支持。

## 2. 删除 AI 专属级联停止，保留审批一致性机制

`src/utils/permissions/approvalTurnScope.ts` 保留根模型基准、根上下文、权限 revision/订阅、请求去重、hook 去重、收据失效与生命周期 retain/release；删除 AI hard_deny 的 stopTurn/stop/signal/throwIfStopped/ApprovalTurnStoppedError、停止控制器注册与全局拒绝计数。避免为本次强制全库重命名该文件。

按引用删除且仅删除 AI 专属停止分支：

- `src/screens/REPL.tsx`：不创建硬停止 UI 回调，正常建立审批上下文与权限订阅。
- `src/query.ts`：移除 AI 停止注册、提前终止和硬停止专属输出；保留 queued_command 更新根证据/失效及根模型更新。
- `src/services/tools/toolExecution.ts`、`StreamingToolExecutor.ts`：删除 AI 停止派发/取消分支；保留用户 ESC、普通工具错误、权限 deny、原有 AbortSignal 语义。
- `src/utils/permissions/permissions.ts`、`src/hooks/toolPermission/PermissionContext.ts`、`handlers/interactiveHandler.ts`：去掉硬停止检查；保留人工单次 claim/resolve、取消竞争和批准收据。
- `src/tools/AgentTool/runAgent.ts`：保留权限订阅 retain/release，不再将代理控制器注册到根安全停止域。
- `src/tasks/LocalAgentTask/LocalAgentTask.tsx`、`src/tools/AgentTool/AgentTool.tsx`：移除 AI 停止绑定、专属 task killed/error 与仅用于此功能的 approvalTurnId/参数，不改变一般用户取消和完成清理。
- `src/Tool.ts`、`src/utils/forkedAgent.ts`：修正“根轮安全停止”注释。普通子代理仍可共享根证据/模型基准与人工审批队列，但不共享拒绝计数或可停止状态；独立团队队友创建边界剥离这类根本地审批上下文和回调，不给不支持的队友启用 auto。

不改普通 ESC 的既有父子控制器关系，不取消已执行后台 Shell，也不移除正常代理退出时的 Shell 清理。

## 3. 拒绝理由同时回到调用代理与主代理

- 调用代理：复用现有工具错误返回，使 deny.reason 进入该代理对话；该代理继续运行，可重新规划。不得因普通审批 deny 设置流式执行器 sibling_error/整个 query abort。
- 主代理：在普通子代理上下文创建处设置最小的父代理拒绝回调（`src/Tool.ts`、`src/utils/forkedAgent.ts`、必要时 `runAgent.ts`）；仅传 agentId、toolUseID、toolName、reason，不复制整段敏感工具参数。
- 审批服务仅在新请求实际得到 deny 时调用一次回调；复用 `scope.requests` 的 Promise 去重，防止同一拒绝重复通知。
- 回调复用 `enqueuePendingNotification`（`src/utils/messageQueueManager.ts:142`），作为非用户授权的 task-notification，按父 agentId 路由到直接父代理；嵌套子代理不得误投其他兄弟或冒充用户指令。
- 对仍在等待同步 Agent 调用的主代理，通知在正常可处理边界接收，不强行中断正在执行的工具。后台代理则通过现有队列接收。保留现有最终 Agent 结果/后台完成通知，不依赖子代理主动在总结中复述拒绝理由。
- 同步、后台、恢复和嵌套路径检查父回调创建位置，确保 resume 后仍有正确父归属；不扩大独立队友支持范围。

## 4. 修复路径规范化与收据校验冲突

位置：`src/services/tools/toolExecution.ts:1228-1268`，审批收据产生于 `src/utils/permissions/autoApproval.ts:240-243`。

- 收据授权的是规范化、最终完整输入，执行必须使用同一份输入。
- AI 收据存在时跳过仅为保留 transcript 原始路径而做的 file_path 回填；其他非 AI 路径保留既有行为，减少改动范围。
- 保留 toolUseID、权限 revision、模式、完整输入严格比较和单次消费检查；不得通过删除比较或模糊路径等价来规避错误。
- 说明 AI 路径结果文本可能显示规范化路径；不额外改文件工具的执行逻辑。

## 5. 审批请求不发送图片

位置：`src/utils/permissions/autoApprovalContext.ts`。

- 历史正文与嵌套 tool_result.content 中的 image/document 块都替换成明确的证据缺失标记；保留 call_id、文本、is_error 和顺序，绝不把图片 base64 JSON 当普通文本送模型。
- 对 root、child、宿主约束/授权载荷、完整 planned_action 的图片字段统一检查，不只清理最外层。沿现有多模态块结构识别，不凭文件扩展名/任意字符串猜图片。
- 当前待审动作本身带图片/文档载荷时，不能改写参数后获批：直接转人工，不调用审批模型；完整执行输入和收据不被裁剪。
- 普通文件路径、图片 URL 的文本提及仍是文字，不当作需要读取/下载的图片；不联网取图，不新增图片处理依赖。

## 6. 文档与可一键运行测试

- 更新现有 `README.md` 和 `precious-crafting-pony.md`：删除/明确取代根轮硬停止、对子代理级联取消、三次拒绝上限、问答即授权等失效描述；阶段交付历史注明为旧实现，不伪造原来已通过验收。
- `src/utils/messages.ts:3413,3423` 的运行提醒及 `src/components/AutoModeOptInDialog.tsx` 的首次确认说明同步为允许/拒绝/回人工，不继续告诉主模型或用户 hard_deny 会停止全轮。
- 修改现有根目录 `test-auto-approval.ts`，顶部常量、内存夹具、一键命令 `bun run ./test-auto-approval.ts`，不依赖真实 API、真实用户配置或其他测试文件。
- 若真实执行器路径需要独立夹具，提供单独可运行测试；不把审批服务返回 allow 当作执行成功，不为测试添加生产开关。

### 必须覆盖

1. deny 只产生当前工具错误；主代理/子代理 A/子代理 B 的控制器均未被审批拒绝 abort，已执行后台命令不受影响。
2. 子代理收到拒绝原因且继续运行；直接父代理收到一次含来源的通知；嵌套与重复同 toolUseID 不误投、不重复。
3. 子代理或主代理重提新动作仍重新审批；已禁止规则和显式 ask 不被重试/普通文字/问答推翻。
4. Windows 正斜杠、相对路径、~ 等经规范化后 AI 批准能走到 tool.call；真正改参/规则变化/模式变化、二次消费仍拒绝。
5. 历史顶层与嵌套图片内容未进入最终请求；大图片历史不因 base64 超预算；当前动作含图片直接回人工，不发送缩略动作。
6. 普通任务文字与 AskUserQuestion 不建立专用权限批准，工具权限弹窗仍正常一次完成。
7. 原有超时/取消/错误 schema/模型选择/usage 去重/静默 allow 行为保持。

## 验证边界

不构建、不改依赖、不提交/推送。提供测试文件与命令，默认不运行测试；完成后只做针对性源码复核和补丁检查，清楚记录未执行项目与端到端验收边界。保留未跟踪的 `test-bypass-mode-cycle.ts`。实现结束同步纠正先前记录中不再成立的 hard_deny 结束代理语义。
