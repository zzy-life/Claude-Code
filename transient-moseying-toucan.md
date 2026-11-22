# 指定命令与专属功能移除计划

## Context

移除不再需要的内置命令及其专属实现，避免只隐藏入口后留下请求链路、推广入口或孤立代码。按功能分阶段执行，每阶段完成引用收敛后再进入下一阶段，不顺带重构其他功能。

**删除范围：** `/advisor`、`/desktop`（含 `/app`）、`/extra-usage`、`/privacy-settings`、`/remote-env`、`/passes`、`/ultrareview`、`/think-back`、`/thinkback-play`。

**已确认排除：** `/remote-control`、`/rc` 不删除；Remote Control 的命令、CLI 参数、服务端和共享远程链路保持原状。

## 执行原则

- 不做“一次性全删注册、之后再清实现”；每阶段同时处理注册、实现、调用方、专属配置及失效提示，保证阶段结束没有本阶段制造的孤立代码。
- 文件、导出、配置字段或依赖包只有确认全部消费者均属于删除范围后才能删除；混合模块只删专属分支，沿本次失去消费者的依赖递归检查，不清理原有无关死代码。
- 保留 `/review`、`/usage`、`/rate-limit-options`、`/upgrade`、模型切换、真实额度/计费判断、登录和隐私告知、插件系统及其他远程任务功能。
- 不删除用户现有配置文件、历史会话或已安装插件，不新增迁移/兼容开关，不调整锁文件或构建配置。
- 每阶段同步更新 `README.md` 对应能力说明，保留能力不误标为移除。

## 阶段 1：独立入口与专属 UI

涉及 `src/commands.ts`、`src/commands/{desktop,remote-env,thinkback,thinkback-play}/`。

- 移除以上命令注册、别名和专属文件。
- 删除失去入口的 `src/components/DesktopHandoff.tsx`、`src/components/RemoteEnvironmentDialog.tsx`；追踪它们的下载、深链和环境选择工具，仅删除没有其他消费者的导出/模块。
- 清除 `src/services/tips/tipRegistry.ts` 和 Desktop 推广中指向 `/desktop` 的失效引导；不扩大到整个 Desktop 集成或独立推广机制。
- 删除年度回顾安装/播放链路，不卸载用户插件，不改通用 marketplace、插件缓存和 Hook 加载逻辑；只修正直接失效的注释。
- 保留远程环境获取、会话传送及设置读取中仍有消费者的代码和配置。

## 阶段 2：赠送资格与隐私设置

涉及 `src/commands/{passes,privacy-settings}/`、`src/components/Passes/`、`src/components/LogoV2/GuestPassesUpsell.tsx`。

- 删除 `/passes` 及专属赠送 UI、资格预取/缓存、欢迎页展示、tip 和访问计数；同步收敛 `src/main.tsx`、Logo/feed 分支和 `src/utils/config.ts` 中专属字段。
- 按导出检查 `src/services/api/referral.ts`，仍被其他功能使用的金额格式化等逻辑不因文件名相同而删除。
- 删除 `/privacy-settings` 的主动设置入口；检查 `src/components/grove/Grove.tsx` 中 `PrivacySettingsDialog` 等命令专属导出。
- **保留** Grove 隐私/条款告知、登录/交互初始化、print 模式检查和 logout 缓存处理所需的 API 与组件，不能整目录删除 Grove。

## 阶段 3：额外用量操作入口（已完成）

涉及 `src/commands/extra-usage/`、`src/commands/rate-limit-options/rate-limit-options.tsx` 及额度提示调用方。

- 删除 `/extra-usage` 的交互/非交互注册、执行实现和专属状态。
- `/rate-limit-options` 当前直接导入并调用 extra-usage：同步删除该菜单项、相关分支和失效引用，保留升级/取消等既有行为。
- 清除欢迎页、配置页、模型提示、限流提示等位置指向已删除命令的操作引导；仍需解释真实额外用量状态的文字保留并改为准确描述。
- 复核管理员申请、赠送额度等 API 的实际消费者，只删本次变为无消费者的部分。
- **保留** usage API 返回结构、余额/额度读取、Fast Mode/1M 权限判断、限流处理及实际计费语义；不把“移除操作入口”变成“禁用或忽略服务端额外用量”。

## 阶段 4：Ultrareview 专属远程审查（已完成）

涉及 `src/commands/review.ts`、`src/commands/review/`、`src/services/api/ultrareviewQuota.ts`。

- 从 `review.ts` 和 `commands.ts` 移除 ultrareview 导出/注册，完整保留本地 `/review` 提示词。
- 删除远程 bughunter 发起、配额/overage 对话框及专属开关。
- 清理 `src/components/PromptInput/PromptInput.tsx` 的 ultrareview 关键词高亮；检查远程任务详情/进度、`RemoteAgentTask` 和图标中的专属展示分支。
- **保留** 通用远程任务创建、轮询、进度展示、会话 API 和其他远程任务类型；历史任务记录不删除，展示回归需覆盖旧记录。

### 第三、四阶段交付记录

- 第三阶段：已删除额外用量命令、菜单操作、管理员申请 API 与专属访问标记；保留真实用量/余额、赠送额度读取、权限和计费判断，失效命令提示改为账户设置说明。
- 第四阶段：已删除远程审查发起、配额/付费确认、关键词展示、专属环境请求及审查状态机；本地 `/review` 提示词和通用远程任务链路保留。
- 历史审查：只在恢复入口识别旧类型/标记，保留 sidecar 和远程会话，在 `/tasks` 中提供历史详情与会话链接；不请求状态、不恢复轮询、不归档远程会话、不伪报成功，也不计入活跃任务。历史恢复时间不当作审查运行时长。
- 独立检查：`node check-phase3-removal.mjs`、`node check-phase4-removal.mjs`；此前两阶段脚本同步调整保留命令清单。仅验证静态约束与提取的纯逻辑，不替代运行验收。
- 未运行构建、未执行 Git 提交/推送。账户限流菜单、Fast Mode/1M 拒绝场景、历史远程记录真实展示和 Remote Control 仍需按环境人工验收。

## 阶段 5：Advisor 全链路与最终收敛（已完成）

涉及 `src/commands/advisor.ts`、`src/utils/advisor.ts`、`src/services/api/claude.ts`、`src/query.ts`、`src/main.tsx`、`src/state/AppStateStore.ts`、`src/utils/settings/types.ts`、`src/cost-tracker.ts` 和消息模块。

- 删除命令、设置/状态传递、实验自动启用路径、Advisor beta、系统指令、服务端工具注入、流式专属处理及专属成本统计。
- 删除 `src/components/messages/AdvisorMessage.tsx` 等失去用途的展示代码，并收敛 `Message.tsx`、`Messages.tsx`、`src/utils/messages.ts` 的相关分支。
- **先检查历史会话协议再删消息类型/过滤逻辑**：旧 Advisor block 不应导致恢复崩溃或被错误发送到不接受它的 API；优先复用现有未知/不支持 block 处理。若确实需要保留最小历史协议处理，明确记录理由，不保留可重新启用 Advisor 的功能实现，也不另建兼容层。
- 最后全仓检查命令名、别名、动态 import/require、专属设置/环境变量/开关、推广入口和文档；对保留命中逐项说明消费者，不能用关键词全删代替依赖分析。

### 第五阶段交付记录

- 已删除 `/advisor`、隐藏 `--advisor`、模型设置/状态、实验自动启用、专属 beta/系统指令/服务端工具注入、流式遥测、展示及递归成本统计；不改写用户旧设置或历史会话。
- 历史协议仅保留 `src/utils/messages.ts` 的既有 `stripAdvisorBlocks` 及 API 边界无条件调用：旧 Advisor use/result 不再透传；只有空白/思考内容时补占位文本，避免空消息。UI 复用未知 block 返回空的既有兜底，不恢复顾问功能。
- `utils/tokens.ts` 的通用 iterations 上下文计算、其他服务端工具和工具配对修复保持；MCP 分类中的安全公告工具与 `get_advisors` 属于外部工具名，与删除功能无关，保留。
- README 与隐藏命令文档已同步；前期脚本删除 Advisor 保留断言。`node check-phase1-removal.mjs` 至 `node check-phase5-removal.mjs` 均通过；第五阶段含历史过滤 11 个用例及过滤先于配对修复的顺序断言。复核发现中断 Advisor use 可能被配对修复提前删除、遗留纯 thinking 或触发 strict 报错，已将旧 block 过滤提前；未扩大修改通用配对逻辑。脚本仅验证静态约束及提取的纯逻辑，不是完整请求链组合测试。
- 未运行构建、未提交/推送。普通对话与工具调用、菜单、真实旧 Advisor 会话恢复后继续对话，以及 Remote Control/远程任务仍需按可用环境人工验收。

## 各阶段验证与交付

1. **开发侧静态核查**：检查被删除文件的直接/动态引用、导出消费者和本次变为孤立的依赖；检查差异，避免保留空分支、恒定条件、未用 import 或失效跳转。不运行构建验证，也不进行 Git 提交/推送。
2. **测试文件**：提供一个可直接 `node` 运行的独立检查脚本，项目路径/目标列表等常量置顶，不依赖额外安装；随阶段补齐命令注册/别名、删除模块引用和关键保留入口检查。仅将其视为静态回归，不宣称证明所有运行行为正确。
3. **用户核心验收**：正常启动并进行普通对话/工具调用；打开 `/help`、`/model`、`/usage`、`/config`；恢复一个普通历史会话；确认本地 `/review`、插件和原有命令可正常使用。
4. **按环境可选验收**：有资格的账户检查隐私告知、额度耗尽菜单；有旧记录时恢复 Advisor/远程审查会话；可用时验证 Remote Control 与远程任务仍按原逻辑工作，不要求无权限环境完成。
5. **阶段简报**：每阶段列出已删能力、保留共享链路、实际检查结果和未覆盖项；阶段检查发现悬空依赖时先修复，不带入下一阶段。
