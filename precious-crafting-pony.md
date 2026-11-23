# 「帮我批准」当前规范与历史交付说明

> 当前规范以已批准的 `wild-exploring-crab.md` 修正为准。本文件已取代原四态/根轮停止方案；历史四阶段是旧实现的交付记录，不是当前行为或运行通过证明。历史交付及本次测试/文档修正均未运行测试、类型检查或构建，未做真实终端/模型验收。

## 1. 产品与权限边界

- 保留权限模式 `auto`，新实现使用 `autoApproval` 命名；标题 `Auto mode`、底栏 `auto mode on`。不增加独立审批人开关、兼容别名或新授权工具。
- 本地可用时 Shift+Tab 顺序：`default → plan → acceptEdits → auto → bypassPermissions → default`，不可用档位跳过，dontAsk 不加入循环。bypassPermissions 名称及现有边界保持不变，ant 环境限制不改。
- auto 复用 acceptEdits 的基础编辑能力，仅审批剩余普通待授权动作。已有规则允许的动作不额外送 AI；这不是审查每个危险动作的系统沙箱。
- 显式 deny 不可推翻；显式 ask、hook 强制 ask、交互工具和不可代批安全检查保留人工，已有 hooks 的授权能力不改。新动作、普通文字或问答均不能覆盖这些边界。
- 首版仅本地交互会话及普通同步/后台/嵌套子代理，不扩展 SDK、headless、bridge/远端或独立团队队友的 auto 支持。默认模式和新版确认只信任用户/管理来源，项目与仓库 local 设置不能静默启用。
- 首次确认后才激活，说明额外模型费用、误判及权限边界。用户当前选择默认使用 `default`、手动切换 auto；新旧版本共用设置时也建议保持 default。新版仍支持用户自行配置默认 auto，不删除程序已有能力；旧版若报告 auto 无效，不要写入全局配置，旧错误界面的 Continue 会跳过整个设置文件。本次不新增旧版配置兼容，不修改用户全局设置。

## 2. 模型只判断当前动作

```ts
type AutoApprovalResult =
  | { decision: 'allow' }
  | { decision: 'deny'; reason: string }
  | { decision: 'needs_user'; reason: string }
```

- **allow**：只批准本次准确完整输入一次，静默、无理由/标记/通知，不创建未来持久 allow 规则，不让模型生成 updatedInput。
- **deny**：只拒绝当前动作，简短英文 reason 通过普通工具错误返回调用代理；调用代理继续运行，由实际代理决定是否调整任务并提交新动作。模型不决定任何代理是否结束，不 abort 主代理、调用子代理、兄弟或后台 Shell 控制器。
- **needs_user**：缺少授权、关键证据或无法判断时回原人工队列，不表示停止任务。超时、接口/解析错误、未知模型或不支持结构化输出也回人工，绝不自动放行。
- 删除拒绝强弱分档、saferAlternative、MAX_DENIALS 和累计三次转人工调度。拒绝不是授权，不可通过换 shell、编码、工具或子代理绕过同一禁止效果；每个新动作仍走既有检查及必要审批。
- 用户 ESC、普通取消、正常代理退出与工具错误的既有语义保留，不把审批 deny 变为 sibling_error 或整个 query abort。toolExecution 在 AI 拒绝结果上设置 host-only `autoApprovalDenied`，StreamingToolExecutor 据此跳过 Bash 审批拒绝触发的兄弟取消；标记不来自模型，普通 Bash 执行失败行为保留。

## 3. 共享一致性，不共享停止域

`ApprovalTurnScope` 无构造参数，仅承载根模型/根消息/约束、权限 revision、工具权限弹窗宿主反馈 verifiedAnswers、非授权任务问答 taskAnswers、requests/hookDecisions 去重、retain/release、trackPermissions/updatePermissions、onInvalidated/invalidateApprovals 等一致性及生命周期机制。不再提供 stop/stopTurn/signal/registerController/throwIfStopped/turnId/consecutiveDenials/previousDenials。

- 普通后代共享根证据及模型基准，权限/根任务证据变化使在途结果及旧收据失效，离开 auto 再切回不能复用旧批准。
- 拒绝历史放在调用代理自己的 `ToolUseContext.autoApprovalDenials`，REPL/fork 分别初始化独立 `[]`，不再使用 scope.previousDenials，不与兄弟共用计数，不把父代理拒绝自动变成子代理授权或反之。
- 同 toolUseID 与准确输入/当前 revision 共享一次 Promise。实际新请求得到 deny 时，仅调用一次 `context.reportAutoApprovalDenial({agentId, toolUseID, toolName, reason})`，不复制敏感参数。
- 普通子代理创建处为直接父代理设置回调，经现有 `enqueuePendingNotification` 以 `priority: 'next'` 投递非用户授权的 task-notification；嵌套、同步、后台和恢复路径保留正确直接父归属。父代理在正常可处理边界接收，不强制打断当前工具。最终 Agent 结果和后台完成通知保留。
- 独立团队队友剥离这类根本地审批上下文与回调，不扩展支持范围。

## 4. 授权来源与多模态上下文

- 普通文字是任务意图与约束，不是专用工具权限批准。AskUserQuestion 不再写入专用授权记录；专用批准仅来自已有工具权限弹窗/审批通道，不新增 SDK 能力。既有 hooks 规则不变。
- `verifiedAnswers` 只用于宿主工具权限弹窗反馈，投影字段为 `host_verified_tool_permission_feedback`，保留完整输入与反馈中的限制；PermissionContext.handleUserAllow 的反馈记录排除 requiresUserInteraction，避免问答被当作专用批准。
- 交互工具（requiresUserInteraction）的完整问题/选项/回答仍由 interactiveHandler 保存到 `scope.taskAnswers`（与 verifiedAnswers 同元素结构）并同步 invalidate。审批服务传给 builder 后仅投影到 `task_question_answers_not_permission_grants`；prompt 明确它只能新增任务限制、不能授予工具权限。删除的是问答专用授权语义，不是新增限制的记录；新限制必须使并发在途审批及旧收据失效。
- 根用户、压缩摘要、工具输出及子代理任务按宿主来源区分；工具 call/result 按 call_id 关联。子代理自述及仓库/网页/工具输出不能冒充用户授权，待审动作历史只放引用，完整动作单独发送。
- 历史正文、嵌套 tool_result、历史工具输入及宿主约束/反馈中的结构化 image/document 递归替换为明确证据缺失标记；保留文本、顺序、call_id/is_error，不把图片 base64 JSON 当普通文字发送。先省略媒体，再计算证据预算，不修改原对话/执行输入。
- 当前 planned_action 在任意深度含 image/document 时直接返回 reason 转人工，不请求审批模型，不发送裁剪动作。普通路径/图片 URL 文本不当作媒体，不联网取图，不按扩展名猜测。

## 5. 模型、预算与费用

- 独立无工具能力的 sideQuery，按根会话实际主模型降一级：Opus → Sonnet，Sonnet/Haiku → Haiku。普通子代理使用根基准，复用默认家族/供应商映射及 modelOverrides；未知/冲突/不可用转人工，不猜家族，不自动升级更贵模型。
- 每次请求发送自足必要证据，不依赖缓存记得上次。固定策略与动态消息分离，首版输入估算预算 12,000 tokens、输出上限 512 tokens、审批总期限 60 秒。动作完整保留，必要证据超限转人工；没有复杂相关历史裁剪或实测 token/价格结论。
- usage 按 response.id 去重，计入会话消耗及 AI approval 子集，不重复收费，不作为主模型当前上下文 usage。迟到或错误 schema 响应仍可能产生费用。

## 6. 路径规范化与单次执行收据

- 审批的是规范化后的最终完整输入，真实执行器有 AI 收据时使用 `callInput = processedInput`，跳过仅为 transcript 保留原始路径的 file_path 回填。非 AI 路径保留原行为，AI 结果文本可能显示规范化路径。
- 严格保留 toolUseID、权限 revision、当前 auto 模式、完整 inputJSON 比较及单次消费，不能删除严格比较或改成模糊路径等价。
- Windows 正斜杠、相对路径和 `~` 规范化后能否到达真实 tool.call，改参/规则变化/模式切换/二次消费能否正确拒绝，仍需真实执行器集成验收。现有一键测试只断言服务收据生成，不直接运行执行器，不能据 allow 推断执行成功。

## 7. 本次保留范围

- 不管理、取消或回滚已执行 Shell；普通代理退出时既有 Shell 清理保留。
- 不修本地命令输出的来源/展示现状。
- 不修退出 plan 后 bypass 自动恢复，用户手动重新进入完全访问。
- 动态目录指令（nested_memory）按访问目标路径，从原 cwd 到目标目录加载 AGENTS/CLAUDE/.claude 指令及路径条件 rules，并匹配用户/管理条件规则；当前审批器仍跳过这些附件。本次仅解释，不修审批器遗漏，不将其混同于 additionalWorkingDirectories。
- ant 环境限制不改，不改依赖、不新增正式测试开关、不构建、不提交/推送。

## 8. 一键测试交付与验证边界

现有根目录 `test-auto-approval.ts` 使用顶部常量、Bun 自带断言及进程内模块夹具，动态导入真实审批服务/上下文/模型解析/usage 代码；不调用真实 API、不执行工具、不修改用户设置、不依赖其他测试文件。

```bash
bun run ./test-auto-approval.ts
```

本次已编写/调整的断言：

1. allow/deny/needs_user 严格 schema，请求与 usage 共享、同 toolUseID 并发及顺序重入只报告一次拒绝。
2. deny 普通返回原因，父/调用子代理/兄弟/后台内存控制器不被取消；并发兄弟审批仍能允许；拒绝历史属于调用 context。
3. 子代理/父代理的新 toolUseID 与新输入重新审批，第四次仍请求模型；旧 toolUseID 改参不能复用旧决定，规则 deny 和显式 ask 不因重试绕过。
4. 权限/输入变化屏蔽迟到允许、人工工具权限反馈使旧证据失效、静默收据生成、生命周期 retain/release。
5. 大图片/文档顶层和嵌套历史、子代理历史、宿主弹窗反馈不泄漏到最终请求；保留调用配对/错误/顺序，原记录不被修改；动作含结构化媒体直接人工且零模型调用，路径/URL 文本仍按普通文字处理。
6. 普通 Question 历史保留工具证据；宿主完整任务问答经 taskAnswers 单独投影到非授权字段，不混入 verifiedAnswers。两个独立 toolUseID 已进入模型请求时，注入新增任务问答并 invalidate，断言两者均回人工、审批信号取消而调用代理未取消，迟到 allow 无收据；新动作请求携带完整新增限制。仅注入宿主写入，不冒充直接运行 interactiveHandler/PermissionContext。任务问答中的嵌套媒体同样省略，原记录保持不变。
7. 模式循环、模型映射、超时/异常/取消及 usage 去重保持。

**未运行**上述测试、类型检查、构建、真实 API 或人工终端验收；PASS 字符串只是运行时输出代码，不是本次结果。模块加载或断言失败都算失败，不能忽略。

独立测试不强行导入重型 forkedAgent/执行器链。尚未被一键测试直接运行的集成项：REPL/fork 独立数组初始化、priority next 父通知投递、host-only autoApprovalDenied 生成与 Streaming Bash 兄弟取消分支、真实执行器路径还原与收据消费/二次消费、StreamingToolExecutor/query 工具错误续轮、真实父通知队列的嵌套/resume/后台路由、Question/权限弹窗真实授权写入及人工 claim/resolve 竞争、配置来源加载、首次确认/快速切换、plan 恢复、后台 task UI、远端/SDK 启动、真实模型判断及费用/主上下文展示。源码核对不等于这些项目已运行通过。

普通用户可用无害临时目标观察 Shift+Tab/首次确认、允许无额外标记、显式 ask 仍人工、离开 auto 后不再审批；拒绝及异常使用注入测试，不以真实破坏或凭据外传验收。后台/嵌套/远端等特殊环境项目可另行集成验证，不要求普通用户搭建。

## 9. 历史四阶段交付记录说明

以下仅压缩保留旧方案的交付历史，不保留冲突条款作为现行要求：

| 历史阶段 | 当时交付范围 | 当前解释 |
| --- | --- | --- |
| 第一阶段（2026-11-22） | 权限契约、基础编辑能力、可信设置及根轮停止基础 | 停止能力属于旧设计，当前已明确删除；权限/来源边界与一致性机制保留。 |
| 第二阶段（2026-11-22） | 独立模型审批、上下文、收据、子代理/后台与 usage | 当时采用四态、级联停止、累计拒绝和问答授权；这些语义已由本文件取代，不再是验收目标。 |
| 第三阶段（2026-11-22） | 模式入口、首次确认、默认模式与支持环境 | 入口/模型/配置的共享能力保留，文案应采用当前动作级 allow/deny/人工出口，不代表 ant 或旧版本兼容另行扩展。 |
| 第四阶段（2026-11-23） | 一键测试、README 和人工验收说明 | 历史测试含旧停止/拒绝上限断言；本次已适配当前协议，不以旧记录证明当前正确。 |

旧四阶段记录均未构建、未运行测试/类型检查或完成真实终端验收。本次源码、测试及文档已按修正规范调整，均未运行，集成仍待验收。当前交付状态为“已调整，待用户运行及集成验收”，不是通过报告。

本功能无新增 HTTP API，无 curl 对接。对接重点是动作级决定、准确输入单次收据、调用代理自己的拒绝历史以及带来源的一次父通知。
