# 隐藏命令 & 秘密开关

> 源码位置：`src/commands.ts`、`src/commands/`、`src/main.tsx`

Claude Code 中有大量未公开的斜杠命令、CLI 参数和环境变量。

---

## Feature-gated 命令

以下命令会受编译开关控制，未启用时不会注册到命令列表。命令名以 `src/commands.ts` 的注册表为准；部分命令还会受到订阅资格、服务端策略或内部构建限制。

| 命令 | 编译开关 | 功能与额外限制 |
|------|---------|------|
| `/buddy` | `BUDDY` | 终端 AI 宠物功能。 |
| `/proactive` | `PROACTIVE` / `KAIROS` | 空闲时主动检查并继续合适的工作。 |
| `/assistant` | `KAIROS` | 跨会话持续运行的持久助手模式。 |
| `/brief` | `KAIROS` / `KAIROS_BRIEF` | 精简输出模式；还需服务端允许且账户具备资格。 |
| `/remote-control`、`/rc` | `BRIDGE_MODE` | 允许网页端或移动端连接并操作当前本地终端；不是 `/bridge`。 |
| `/remote-control-server` | `DAEMON` + `BRIDGE_MODE` | 在本机启动远程控制服务端。 |
| `/voice` | `VOICE_MODE` | 语音交互；还需 Claude.ai 订阅和语音服务端开关。 |
| `/fork` | `FORK_SUBAGENT` | 创建独立的子 Agent 分叉会话；未启用时 `/fork` 是 `/branch` 的别名。 |
| `/peers` | `UDS_INBOX` | 本地 Claude 进程之间的收件箱与协作通信。 |
| `/workflows` | `WORKFLOW_SCRIPTS` | 将预定义的多步骤开发流程保存、管理并重复执行。 |
| `/torch` | `TORCH` | 内部代号功能；源码未提供面向外部的稳定用途。 |
| `/web-setup` | `CCR_REMOTE_SETUP` | 在 Claude 网页端连接 GitHub 并设置 Claude Code；还需 Claude.ai 登录、服务端开关及远程会话策略许可。 |
| `/ultraplan` | `ULTRAPLAN` | 云端长时间独立研究与规划；当前外部构建的 `isEnabled` 固定为 `false`。 |
| `/force-snip` | `HISTORY_SNIP` | 强制截断历史；即使开关启用，仍仅限内部构建。 |

---

## 仅内部用户命令

以下命令只有 `USER_TYPE === 'ant'` 且非 Demo 构建时才会注册。它们定义在 `src/commands.ts` 的 `INTERNAL_ONLY_COMMANDS`；不应视为外部用户可用功能。

| 命令 | 功能 |
|------|------|
| `/backfill-sessions` | 回填历史会话数据。 |
| `/break-cache` | 强制打破提示缓存。 |
| `/bughunter` | 内部 Bug 诊断工具。 |
| `/commit` | 创建 Git 提交。 |
| `/commit-push-pr` | 执行内部提交、推送和创建 Pull Request 工作流。 |
| `/ctx_viz` | 上下文占用可视化。 |
| `/good-claude` | 提交内部正向反馈。 |
| `/issue` | 内部 issue 工作流。 |
| `/init-verifiers` | 初始化验证器。 |
| `/mock-limits` | 模拟速率限制。 |
| `/bridge-kick` | 断开桥接连接。 |
| `/version` | 查看或诊断内部版本信息。 |
| `/reset-limits` | 重置速率限制。 |
| `/onboarding` | 内部引导流程。 |
| `/share` | 分享会话。 |
| `/summary` | 生成会话摘要。 |
| `/teleport` | 在本地与远程环境之间传送会话。 |
| `/ant-trace` | 内部追踪工具。 |
| `/perf-issue` | 性能问题诊断。 |
| `/env` | 环境变量管理。 |
| `/oauth-refresh` | 刷新 OAuth 凭据。 |
| `/debug-tool-call` | 调试工具调用。 |
| `/agents-platform` | 智能体平台入口；当前还原开发构建标注为不可用。 |
| `/autofix-pr` | 自动修复 Pull Request。 |

`/force-snip`、`/ultraplan`、`/subscribe-pr` 还分别受 `HISTORY_SNIP`、`ULTRAPLAN`、`KAIROS_GITHUB_WEBHOOKS` 等开关约束；即使进入内部构建也未必可用。`/files` 与 `/tag` 属于常规注册表中的受限命令，不属于 `INTERNAL_ONLY_COMMANDS`。

---

## 其他不常见命令

外部版本可见但鲜为人知：

| 命令 | 功能 |
|------|------|
| `/stickers` | 查看贴纸订购信息。 |
| `/think-back` / `/thinkback-play` | 年度使用回顾及其播放界面；受远程功能开关限制。 |
| `/rewind` | 将代码和/或对话回退到先前状态。 |
| `/heapdump` | 将 JavaScript 堆内存快照写入桌面目录，供内存问题诊断。 |
| `/sandbox` | 切换命令执行沙箱。 |
| `/chrome` | Claude in Chrome 浏览器扩展设置（Beta）。 |
| `/advisor` | 配置辅助顾问模型；仅具备资格的账户可见。 |
| `/btw` | 在不打断主任务的情况下发起简短旁路提问。 |

---

## 隐藏 CLI 参数

定义在 `src/main.tsx` 第 3817-3877 行，通过 `hideHelp()` 隐藏。

### 所有构建可见但隐藏

| 参数 | 功能 |
|------|------|
| `--teleport [session]` | 恢复传送会话 |
| `--remote [description]` | 创建远程会话 |
| `--sdk-url <url>` | WebSocket 端点（仅 `-p` 模式） |
| `--advisor <model>` | 服务端顾问工具 |
| `--agent-id <id>` | 队友代理 ID |
| `--agent-name <name>` | 队友显示名称 |
| `--team-name <name>` | 团队名称 |
| `--agent-color <color>` | 队友 UI 颜色 |
| `--plan-mode-required` | 需要先进入计划模式 |
| `--parent-session-id <id>` | 父会话 ID |
| `--teammate-mode <mode>` | 队友生成方式 |
| `--agent-type <type>` | 自定义代理类型 |

### 仅 ant 构建

| 参数 | 功能 |
|------|------|
| `--delegate-permissions` | `--permission-mode auto` 别名 |
| `--afk` | 已弃用的 auto 模式别名 |
| `--tasks [id]` | 任务模式 |

### Feature-gated 参数

| 参数 | 编译开关 |
|------|---------|
| `--proactive` | `PROACTIVE` / `KAIROS` |
| `--brief` | `KAIROS` / `KAIROS_BRIEF` |
| `--assistant` | `KAIROS` |
| `--channels <servers...>` | `KAIROS` / `KAIROS_CHANNELS` |
| `--remote-control [name]` / `--rc` | `BRIDGE_MODE` |
| `--hard-fail` | `HARD_FAIL` |
| `--enable-auto-mode` | `TRANSCRIPT_CLASSIFIER` |
| `--messaging-socket-path <path>` | `UDS_INBOX` |

---

## 隐藏环境变量

### 常用但未公开

| 环境变量 | 功能 |
|----------|------|
| `ANTHROPIC_MODEL` | 覆盖默认模型 |
| `CLAUDE_CODE_MAX_OUTPUT_TOKENS` | 最大输出 token 数 |
| `CLAUDE_CODE_DISABLE_THINKING` | 禁用思考 |
| `CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING` | 禁用自适应思考 |
| `CLAUDE_CODE_PROACTIVE` | 主动模式 |
| `CLAUDE_CODE_COORDINATOR_MODE` | 协调器模式 |
| `CLAUDE_CODE_BRIEF` | 简报模式 |
| `CLAUDE_CODE_SYNTAX_HIGHLIGHT` | 语法高亮主题 |
| `CLAUDE_CODE_DISABLE_AUTO_MEMORY` | 禁用自动记忆 |
| `CLAUDE_CODE_IDLE_THRESHOLD_MINUTES` | 空闲阈值（默认 75 分钟） |
| `CLAUDE_CODE_MAX_TOOL_USE_CONCURRENCY` | 最大工具并发数 |

### 第三方模型集成

| 环境变量 | 功能 |
|----------|------|
| `CLAUDE_CODE_USE_BEDROCK` | 使用 AWS Bedrock |
| `CLAUDE_CODE_USE_VERTEX` | 使用 Google Vertex |
| `CLAUDE_CODE_USE_FOUNDRY` | 使用 Foundry |
| `CLAUDE_CODE_SKIP_BEDROCK_AUTH` | 跳过 Bedrock 认证 |
| `CLAUDE_CODE_SKIP_VERTEX_AUTH` | 跳过 Vertex 认证 |

### API 扩展

| 环境变量 | 功能 |
|----------|------|
| `CLAUDE_CODE_EXTRA_BODY` | API 请求附加 JSON body |
| `CLAUDE_CODE_EXTRA_METADATA` | API 请求附加元数据 |
| `CLAUDE_CODE_CLIENT_CERT` | 客户端证书 |
| `CLAUDE_CODE_ATTRIBUTION_HEADER` | 归属头部 |

### 会话与身份

| 环境变量 | 功能 |
|----------|------|
| `CLAUDE_CODE_OAUTH_TOKEN` | OAuth 令牌 |
| `CLAUDE_CODE_OAUTH_REFRESH_TOKEN` | OAuth 刷新令牌 |
| `CLAUDE_CODE_ACCOUNT_UUID` | 帐户 UUID |
| `CLAUDE_CODE_ORGANIZATION_UUID` | 组织 UUID |
| `CLAUDE_CODE_CUSTOM_OAUTH_URL` | 自定义 OAuth URL |

### 仅内部用户

| 环境变量 | 功能 |
|----------|------|
| `CLAUDE_INTERNAL_FC_OVERRIDES` | GrowthBook 功能覆盖 JSON |
| `CLAUDE_CODE_GB_BASE_URL` | GrowthBook API URL 覆盖 |
| `ULTRAPLAN_PROMPT_FILE` | Ultraplan 提示文件覆盖 |
| `MAX_THINKING_TOKENS` | 最大思考 token 数 |
| `SESSION_INGRESS_URL` | 会话入口 URL |
| `IS_DEMO` | 演示模式 |
