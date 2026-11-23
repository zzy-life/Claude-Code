# Claude Code 源码还原

> 从 `@anthropic-ai/claude-code` npm 包的 source map 中还原的完整 TypeScript 源码，**可本地运行**

<p align="center">
  <img src="preview.png?raw=true" alt="Claude Code CLI" width="700">
</p>

> [!WARNING]
> 本仓库为**非官方**版本，基于公开 npm 发布包 source map 还原，**仅供研究学习**。源码版权归 [Anthropic](https://www.anthropic.com) 所有。

---

## 阅读导航

- **普通用户**：查看[普通用户指南](#普通用户指南)，了解安装、代理配置、模型选择、文件引用和斜杠命令。
- **开发者**：查看[开发者指南](#开发者指南)，了解源码运行、依赖维护、代理接口和内部实现。

## 普通用户指南

### 安装与启动

需要 Node.js ≥ 20.19；使用 npm 安装发布包，无需安装 Bun 或下载源码。

```bash
npm install -g @zzy1998/claude-code
ccli
```

<a id="codex-claude-proxy-剩余额度提示"></a>

### 代理配置与额度提示

当通过 Codex Claude Proxy 调用模型时，CLI 会在每轮对话结束后查询代理额度，并在输入框左下角显示：

```text
? for shortcuts · quota 85% · ctx 123k/160k
```

`85%` 是当前 Client API Key 的本周剩余额度百分比。CLI 使用现有环境变量连接和鉴权：

```powershell
$env:ANTHROPIC_BASE_URL = "http://127.0.0.1:8081"
$env:ANTHROPIC_API_KEY = "你的 Client API Key"
```

也可以使用一条命令写入代理所需的用户级配置：

```powershell
ccli proxy config set <代理地址> <你的密钥>
```

该命令会将指定的 HTTP 或 HTTPS 代理地址写入 `ANTHROPIC_BASE_URL`，并同时设置 `ANTHROPIC_AUTH_TOKEN`、`ANTHROPIC_API_KEY` 和 `CLAUDE_CODE_AUTO_COMPACT_WINDOW=258000`。它会保留 `~/.claude/settings.json` 中的其他配置，清除可能覆盖代理模型设置的 `ANTHROPIC_DEFAULT_HAIKU_MODEL`、`ANTHROPIC_DEFAULT_OPUS_MODEL`、`ANTHROPIC_DEFAULT_SONNET_MODEL` 及 `ANTHROPIC_MODEL`。配置完成后重启 Claude Code 生效。

每轮对话结束后，额度右侧还会显示当前会话的上下文占用和可用窗口，例如 `ctx 123k/160k`；分母复用自动压缩的有效窗口计算，会应用 `CLAUDE_CODE_AUTO_COMPACT_WINDOW` 并扣除摘要预留 token。未配置上述环境变量、代理不支持用量查询或请求失败时，CLI 不显示额度提示，不影响正常对话。

### 模型与上下文

`/model` 菜单只展示一个默认 Haiku 入口：1M 可用且通过 `availableModels` 白名单时优先展示 `Haiku (1M context)`，否则回退普通 `Haiku`（仍须通过白名单）；第三方自定义 Haiku 配置优先。也可以使用 `/model haiku[1m]` 显式选择 1M 上下文。该选项需要代理或模型端点支持，不代表官方 Haiku 4.5 已支持 1M。自动压缩仍受 `CLAUDE_CODE_AUTO_COMPACT_WINDOW` 限制：配置为 `258000` 时，通常约在 225,000 tokens 触发压缩；未配置该上限时，1M 选项通常约在 967,000 tokens 触发压缩（均按摘要预留 20,000 tokens、缓冲 13,000 tokens 计算）。

### 权限模式与帮我批准

在本地交互终端按 `Shift+Tab` 切换权限模式。可用时顺序为：

```text
default → plan → acceptEdits → auto → bypassPermissions → default
```

不可用的 auto / bypassPermissions 档位会跳过；`dontAsk` 不加入此循环。底栏分别显示 `plan mode on`、`accept edits on`、`auto mode on` 和 `bypass permissions on`。

| 模式 | 行为 |
|---|---|
| `default` | 按现有规则检查，未授权动作询问用户。 |
| `plan` | 沿用计划模式限制；不会在后台隐式开启 AI 审批。 |
| `acceptEdits` | 自动允许现有工作区编辑及符合原检查的部分操作，其余询问用户。 |
| `auto`（Auto mode，帮我批准） | 复用 acceptEdits 基础能力，仅将剩余普通待授权请求交给独立 AI 审批。 |
| `bypassPermissions` | 保留原完全访问模式及危险模式确认，跳过常规审批；不使用 AI 审批，也不代表无条件执行。 |
| `dontAsk` | 已有授权照常生效，需要询问但未获授权的动作直接拒绝；不使用 AI。 |

权限规则里的 **allow** 是允许匹配动作，**deny** 是禁止匹配动作，显式 **ask** 是“这类动作必须问我”。AI 不能推翻 deny；实际触发的显式 ask、hook 强制询问、交互工具和不可代批的安全检查仍走人工。已有 hooks 的授权能力保留。普通规则 deny 只拒绝此次调用，不等于下面的 AI 硬停止。

首次切入 auto 会说明费用、误判及停止边界，确认成功后才激活。会话内切换的确认选择取消时留在原模式；启动时请求默认 auto、但尚未完成确认时，选择取消会退出程序。旧 `skipAutoPermissionPrompt` 不替代新版确认。确认仅保存到用户设置，不自动修改项目设置；普通 Shift+Tab 切换不保存为默认模式，但确认框选择 `Yes, and make it my default mode` 会同时保存用户级默认 auto。之后 Shift+Tab 仅退出当前模式；取消后续启动的默认 auto 需通过 `/config` 或用户级配置修改默认模式。

需要默认开启时，可在 `/config` 中显式选择并保存，或将以下内容合并到用户级 `~/.claude/settings.json`（Windows 通常是 `%USERPROFILE%\.claude\settings.json`），不要覆盖其他设置：

```json
{
  "permissions": {
    "defaultMode": "auto"
  }
}
```

默认 auto 和新版确认只信任用户级/受管理设置；项目设置、仓库内 local 设置不能静默启用或代替确认。管理员禁用策略仍然有效。不要手工复制确认字段来跳过说明。

**审批结果**：

- 允许：仅批准此次完整原样动作，正常执行，无批准理由、额外标记或通知，也不保存未来 allow 规则。
- 可换方案的拒绝：不执行此次动作，显示 `This action was denied. Try a safer alternative: …`；主模型可提出实质更安全的新方案，新动作重新检查。连续第三次拒绝转人工，避免反复改写绕过。
- 硬拒绝：显示 `Turn blocked and stopped: …`，程序停止本轮主代理及所属普通本地子代理，包括其后台后代；不停止其他轮的任务。新用户输入开始新轮，不自动重试被拒动作。
- 缺少授权/证据、未知模型、结构化输出不支持、接口错误或 60 秒审批超时：不自动执行，显示 `User approval required: …` 并转原人工队列。用户取消按原中止语义处理。

**模型与费用**：以根会话实际主模型为基准降一级：Opus → Sonnet，Sonnet / Haiku → Haiku；普通子代理也用根会话基准，不按自己的模型再次降级。复用默认家族模型、供应商映射和 `modelOverrides`，不另设审核型号；映射未知/冲突或目标不可用时转人工，不自动升级到更贵模型。自定义代理的家族名称不保证实际价格更低。

每次审批是独立、无工具能力的模型请求，经现有鉴权/API 路径发送固定策略、可验证根用户任务及限制、完整人工问答、相关主/子代理文本历史与工具调用/结果、当前环境/权限规则、前次拒绝及完整待审参数。工具输出、仓库材料和代理自述不作为用户授权；不额外读取密钥、全仓库、图片或完整主系统提示词。每次发送自足证据，不依赖缓存记住上次请求。当前实现输入估算预算为 **12,000 tokens**（含策略/schema 和封装预留），输出上限 **512 tokens**；不截断动作，完整证据超预算则转人工，尚未实现复杂相关历史裁剪。估算不是实际计费量。

审批产生额外模型请求和费用；真实 usage 按现有模型价格统计计入会话总消耗/预算，另列 AI approval 子集（`included` 表示已包含，不是再加一次），不计为主模型当前上下文占用。迟到或格式错误的响应也可能已经产生费用；最终以供应商/代理账单为准，目前没有真实质量、token 或金额实测结论。

**适用范围和限制**：首版仅本地交互会话及其普通同步/后台/嵌套子代理；不向 SDK、print/headless、bridge/远端或独立团队队友提供 AI 审批。这些环境忽略默认 auto，显式请求则报错；本地 Remote Control 与 auto 互斥。退出 plan 恢复 auto 时仍检查当前策略和新版确认。

**这不是系统级沙箱，也不是“每个危险动作都审查”**：acceptEdits 已允许的部分 Bash 文件操作（可能包括删除）不会再次送 AI；现有规则和安全边界继续生效。硬停止尽力取消已启动动作，不能回滚文件修改/网络副作用，也不能保证第三方 MCP 服务支持远端取消。AI 可能误判，重要操作仍应保留显式 ask。

### VS Code 终端标题与会话名称

如果 VS Code 集成终端的标签只显示 `bun` 等进程名，可能是终端标签配置没有使用程序设置的标题。可以按 `Ctrl+Shift+P`，选择“首选项：打开用户设置(JSON)”，将下面的配置合并到现有的设置对象中（不要覆盖整个文件）：

```json
{
  "terminal.integrated.tabs.title": "${sequence}"
}
```

`${sequence}` 表示显示程序通过终端转义序列设置的标题。此用户级配置会影响其他 VS Code 集成终端，Claude Code 不会自动修改它。

配置后重新打开集成终端，启动 Claude Code 并发送一条正常任务消息，等待 AI 生成标题。如果仍没有变化，请检查是否手动重命名了终端，或设置了 `CLAUDE_CODE_DISABLE_TERMINAL_TITLE` 禁用标题更新。

终端标签标题与 `/resume` 中的历史会话名称是两个显示位置：

- 新会话首次发送正常任务消息时，会异步调用 Haiku 生成标题；成功后同时用于终端标签，并保存到会话供 `/resume` 显示，不额外增加模型请求。
- 即使终端没有展示程序设置的标题，也不影响生成成功的标题保存到会话。
- 用户指定的会话名称始终优先，不会被自动标题覆盖。执行 `/rename 自定义名称` 可直接命名，执行不带参数的 `/rename` 可根据当前对话调用 AI 生成并保存名称。
- 恢复旧会话不会自动补生成标题。设置 `CLAUDE_CODE_DISABLE_TERMINAL_TITLE` 禁用标题时，也会保留原有行为，不触发上述首次消息的自动标题生成与保存。

### 输入框文件引用

在普通 Prompt 模式中，使用 `@` 引用项目文件或目录。`@` 必须位于输入行开头，或紧跟在空格、换行等空白字符之后；不要与前面的文字直接相连。

```text
请帮我阅读 @src/hooks/useTypeahead.tsx
请查看 @package.json
```

以下写法不会触发文件补全：

```text
请查看@src/index.ts
```

输入 `@` 后会自动显示候选项；可继续输入文件名前缀，或使用方向键和 `Tab` 选择。

### 斜杠命令清单

命令注册以 `src/commands.ts` 为准；`src/commands/` 的文件数量不等于当前构建中可输入的命令数量。下面按**常用**、**高级与集成**、**受限/实验/内部**三组列出，并保留实际命令名及别名。部分命令会受登录状态、套餐、平台、环境变量或编译开关限制。

#### 一、用户常用

| 命令（含别名） | 用途 |
|---|---|
| `/help` | 显示帮助与可用命令。 |
| `/clear`、`/reset`、`/new` | 清除对话历史并释放上下文。 |
| `/compact [指令]` | 压缩历史对话，并保留摘要。 |
| `/context` | 查看当前上下文占用；交互模式显示彩色网格。 |
| `/model` | 切换当前会话模型。 |
| `/effort` | 设置模型的 effort 等级。 |
| `/plan` | 进入计划模式或查看当前会话计划。 |
| `/status` | 查看 Claude Code 状态。 |
| `/diff` | 查看未提交改动及本轮差异。 |
| `/copy` | 复制最近一条消息内容。 |
| `/rename` | 重命名当前会话。 |
| `/resume`、`/continue` | 恢复之前的会话。 |
| `/rewind`、`/checkpoint` | 将代码和/或对话回退到先前状态。 |
| `/branch` | 从当前节点创建会话分支；未启用 `FORK_SUBAGENT` 时，`/fork` 是其别名。 |
| `/exit`、`/quit` | 退出 REPL。 |
| `/feedback`、`/bug` | 提交 Claude Code 反馈。 |
| `/theme` | 切换终端主题。 |
| `/vim` | 切换 Vim 或普通编辑模式。 |
| `/color` | 设置当前会话提示栏颜色。 |
| `/btw` | 在不打断主任务的情况下发起简短的旁路提问。 |
| `/stats` | 查看 Claude Code 用量统计与活动情况。 |
| `/release-notes` | 查看发行说明。 |
| `/stickers` | 查看贴纸订购信息。 |

#### 二、高级与集成

| 命令（含别名） | 用途 |
|---|---|
| `/add-dir <path>` | 将目录添加到工作区。 |
| `/agents` | 管理 Agent 配置。 |
| `/mcp` | 管理 MCP 服务器。 |
| `/plugin`、`/plugins`、`/marketplace` | 管理插件与插件市场。 |
| `/reload-plugins` | 使本会话加载待应用的插件改动。 |
| `/skills` | 列出可用的 Skills。 |
| `/hooks` | 查看工具事件 Hook 配置。 |
| `/permissions`、`/allowed-tools` | 管理工具允许/拒绝规则。 |
| `/config`、`/settings` | 打开配置面板。 |
| `/keybindings` | 管理快捷键配置。 |
| `/ide` | 管理 IDE 集成并查看其状态。 |
| `/init` | 初始化项目级配置和指导文件。 |
| `/doctor` | 诊断安装与配置问题。 |
| `/memory` | 编辑 Claude 记忆文件。 |
| `/export` | 将当前会话导出至文件或剪贴板。 |
| `/pr-comments` | 获取 GitHub Pull Request 评论。 |
| `/review` | 审查 Pull Request。 |
| `/security-review` | 对当前分支的待处理改动执行安全审查。 |
| `/tasks`、`/bashes` | 查看和管理后台任务。 |
| `/team [on\|off\|status]` | 开启、关闭或查看当前会话的 Team 模式；开启即代表授权，并直接注入 `TeamCreate`、`TeamDelete`，不经过 `ToolSearch`。 |
| `/mobile`、`/ios`、`/android` | 显示 Claude 移动端下载二维码。 |
| `/install-github-app` | 为仓库配置 Claude GitHub Actions。 |
| `/install-slack-app` | 安装 Claude Slack App。 |
| `/login`、`/logout` | 登录或登出 Anthropic 账户。 |
| `/usage` | 显示 Claude.ai 套餐用量限制；仅 Claude.ai OAuth 订阅者可见。通过自定义 `ANTHROPIC_BASE_URL` 的代理、Bedrock、Vertex、Foundry 或普通 API Key 使用时，该命令会被隐藏；支持用量查询的代理仍可在输入框 footer 显示额度提示。 |
| `/upgrade` | 升级至 Max；受账户资格限制。 |
| `/output-style` | 已弃用；请改用 `/config` 调整输出样式。 |
| `/statusline` | 配置状态栏显示。 |
| `/terminal-setup` | 执行终端设置/安装引导。 |

#### 三、受限、实验或内部命令

| 命令 | 用途与限制 |
|---|---|
| `/files` | 列出本次会话已加入上下文、可供模型参考的文件；仅内部构建可用。 |
| `/remote-control`、`/rc` | 原用于网页端或移动端连接本地终端；当前授权 gate 固定为 `false`，入口不可启用，不能通过旧覆盖变量放行。 |
| `/session`、`/remote` | 生成远程会话链接和二维码，用其他设备继续或查看当前会话；仅远程会话模式可用。 |
| `/chrome` | 连接、设置或管理 Claude in Chrome 浏览器扩展（Beta）；需满足登录和会话条件。 |
| `/sandbox` | 启用或关闭命令执行沙箱，以限制工具可访问的系统资源。 |
| `/fork` | 将当前任务分叉为独立的子 Agent 会话，用于并行处理；未启用该功能时它只是 `/branch` 的别名。 |
| `/proactive` | 让助手在空闲期间自主检查待办、继续合适的工作；需启用持久助手/主动模式实验。 |
| `/brief` | 切换为更精简的回答风格；需启用 KAIROS 助手实验且账户具备资格。 |
| `/assistant` | 开启可跨会话持续工作的持久助手模式；属于 KAIROS 实验功能。 |
| `/remote-control-server` | 在本机启动远程控制服务端，供其他 Claude 客户端连接；仅内部/实验构建可用。 |
| `/voice` | 用语音输入与 Claude 交互；需语音实验、订阅资格和服务端开关均已启用。 |
| `/peers` | 管理本地 Claude 进程之间的消息收件箱和协作通信；仅实验构建可用。 |
| `/workflows` | 管理可复用的工作流脚本：把一组预定义步骤保存为命令，以便重复执行开发流程；仅启用工作流实验时可用。 |
| `/torch` | Anthropic 内部代号功能；源码未提供面向外部用户的稳定用途说明，默认不可用。 |
| `/heapdump` | 将当前 JavaScript 内存快照写入桌面目录，供排查内存泄漏或异常内存占用，不用于日常开发。 |

---

### 已移除功能与保留边界

本仓库已对还原源码进行裁剪，以下能力不再是当前版本提供的功能；旧文档、历史配置键或编译开关名称不代表它们仍然可用。

| 已移除内容 | 保留能力／替代方式 |
|---|---|
| `/advisor`、`--advisor`、顾问模型设置与实验启用、服务端顾问工具注入及专属计费/展示 | 普通模型、工具调用和会话成本统计保留；旧会话不删除，仅在发送 API 前过滤不再支持的 Advisor block，避免恢复后请求被拒绝，不恢复顾问能力。 |
| `/extra-usage` 交互/非交互操作、限流菜单中的额外用量操作及管理员额度申请 | `/usage` 的真实用量与余额展示、赠送额度资格读取、Fast Mode/1M 权限及实际计费判断保留；额度设置由账户用量设置管理，`/rate-limit-options` 保留升级与等待重置选项。 |
| `/ultrareview` 远程审查、专属配额/付费确认、关键词高亮与审查轮询 | 本地 `/review` 提示词、通用远程任务创建/恢复/轮询/进度与 Remote Control 保留；不提供旧审查记录的专属恢复与展示兼容，不迁移或清理用户历史文件。 |
| `/passes` 赠送资格、邀请奖励展示及后台资格预取，`/privacy-settings` 主动隐私设置界面 | 启动时的隐私/条款告知、接受选择、print 模式检查与登录/登出缓存处理保留；真实额度与额外用量功能不受本阶段影响。 |
| `/desktop`、`/app` 会话转交及 Desktop 启动推广弹窗，`/remote-env` 环境选择界面，`/think-back`、`/thinkback-play` 内置年度回顾安装与播放 | 普通 Desktop 介绍 tip、远程环境配置读取与会话传送、通用插件系统保留；不卸载用户已安装插件。`/remote-control`、`/rc` 及远程控制链路未移除。 |
| 内置 Computer Use、专属授权界面及三个依赖空壳 | 通用 MCP 和 Chrome 接入代码保留；不代表原生空壳实现已恢复可用。 |
| Undercover 模式、自动提交／PR 署名注入及 `attribution`、`includeCoAuthoredBy` 设置 | 普通 Git 工作流提示和 `includeGitInstructions` 保留；旧署名键不再控制行为，不自动改写用户配置。 |
| 内置 `/commit`、`/commit-push-pr`、`/verify`、`/stuck` | 用户自定义同名命令／技能仍可使用，普通 `/review` 和 `/debug` 保留。 |
| `/cost`、`/version`、`/bridge-kick`、`/web-setup`、内部 lorem-ipsum 入口及已禁用的内部桩命令 | 会话成本统计、退出摘要、Bridge 底层实现和共享远程会话代码保留；Bridge 入口的可用性仍受固定默认值限制，桩命令清单见隐藏命令文档。 |
| 云端深度规划 ultraplan、旧云端启动消息专用排版、buddy 电子宠物、Overflow／Tungsten 内部测试工具 | 普通计划模式、本地命令输出、远程任务及 Bash 的 tmux 隔离机制保留。 |
| DevBar／员工 API 性能面板、限流模拟和内部自动 issue 链路 | 真实 429 重试、总耗时与成本、慢操作日志以及 `/feedback`、`/bug` 保留。 |
| 会话／记忆／压缩／技能改进问卷及 `feedbackSurveyRate` 设置 | 普通技能与 Hook 执行保留；不再后台生成技能改进问卷。 |
| 旧 auto 远程实验资格、二态转录审批、旧批准通知及 plan 内隐式分类器启用 | `auto` 模式保留，改由本地 `autoApproval` 四态审批实现；旧 opt-in/critique 入口不再提供。共享 Bash 分类、PermissionRequest hooks、原 deny/ask 及 bypassPermissions 链路保留，不是恢复远程实验系统。 |
| 官方统计上传、远程 GrowthBook 求值、Gates 标签页、本地特性覆盖和设置同步 | 用户显式配置的 OTEL、本地错误日志、显式启动 profiling、托管设置及正常设置监听保留。功能查询固定采用调用方默认值。 |

`CLAUDE_INTERNAL_FC_OVERRIDES`、`growthBookOverrides` 和 `CLAUDE_CODE_GB_BASE_URL` 已不生效。默认值为 `false` 的会话记忆／后台提取门控也不会因设置内部用户身份而自动启用；普通记忆文件和正常压缩不等于后台自动提取器。贡献追踪仍有历史缺失模块，不保证端到端文件贡献采集可用。

## 开发者指南

<a id="本地安装并运行"></a>

### 源码本地运行

项目建议使用 Bun 1.3.5，并需要 Node.js ≥ 20.19。

#### 安装 Bun

```bash
npm install -g bun@1.3.5
```

Windows PowerShell：

```powershell
iex "& {$(irm https://bun.com/install.ps1)} -Version 1.3.5"
```

#### 安装依赖并启动

```bash
bun ci            # 安装依赖（需要 Bun ≥ 1.3.5、Node.js ≥ 20.19）
bun run dev       # 启动 CLI
bun run version   # 验证版本
```

> 日常安装请使用 `bun ci`，不要使用普通 `bun install`，避免依赖重新解析后发生版本漂移。

### AI 审批开发与验收

根目录独立测试使用 Bun 自带断言、`bun:test` 的进程内模块替换和注入响应，无额外测试框架、测试服务、真实 API 或其他测试文件依赖。需要先按上述方式安装项目依赖，在仓库根目录执行：

```bash
bun run ./test-auto-approval.ts
```

测试常量集中在文件顶部；不修改真实用户设置、不执行 shell/文件工具、不发网络请求。断言失败或模块加载失败时进程应非零退出；只有运行完成才可据实际 `PASS` 输出判断。**第四阶段交付时未运行此测试、构建或类型检查，不能把测试代码存在当成验证通过。**

测试直接加载审批服务、轮次停止域、上下文投影、模式循环、家族解析和 usage 去重；隔离模型默认值、设置/gate、token 估算、费用写入、API/UI 依赖。覆盖四态、请求共享、精确输入收据生成、输入/权限失效、最终规则复查、三次拒绝上限、超时/异常/取消、模型家族/供应商表/override 冲突、call/result 配对、来源边界、完整动作预算及独立轮次隔离。费用断言使用合成 usage 和固定金额，不验证实际价格；模式循环使用内存 gate，不验证首次确认 UI。

**源码边界**：

- `src/utils/permissions/autoApproval.ts`：普通待授权请求的独立 `sideQuery`；准确输入快照、权限 revision 和 toolUseID 绑定，allow 收据由 `src/services/tools/toolExecution.ts` 在真实 `tool.call` 前核验并一次消费。不把审批模型结论或 usage 注入主模型上下文，不执行审批模型生成的参数改写。
- `autoApprovalPrompt.ts` / `autoApprovalContext.ts`：固定策略与动态来源证据隔离；完整动作仅在末尾发送，历史待审调用用引用替代。缺根授权或完整证据超预算回人工；固定估算尚非实测。
- `approvalTurnScope.ts`：每个根轮次独立停止域，普通子代理继承；hard_deny 同步锁定再取消所属控制器。`LocalAgentTask` 按归属更新后台任务状态，不使用 killAll；普通 ESC 不等于安全硬停止。
- `interactiveHandler.ts` / `PermissionContext.ts`：人工兜底复用根会话队列和一次完成竞争保护；进入人工后不再启动其他自动批准者。`autoApprovalModel.ts` 按 response.id 去重，将审批 usage 归入现有会话消耗及审批子集，不重复计费。
- 设置来源过滤、首次确认、快速切换、plan 恢复、远端拒绝和子代理真实执行仍涉及宿主集成。独立测试**不覆盖**真实执行器消费收据、人工回调竞争、React 快捷键竞态、后台任务 UI、真实 API schema 接受情况、模型判断质量及主上下文/账单展示；这些仅作源码核对或另行集成验收，不伪称一键测试已全部覆盖。

**用户可操作验收（使用临时工作目录与无害目标）**：

1. 用 Shift+Tab 依次观察 default → plan → acceptEdits → auto → bypassPermissions（开放时）→ default。首次 auto 确认取消后应留在原档位；再次选择并确认后显示 `auto mode on`。快速切换时陈旧确认框不得把模式切回 auto。
2. 做普通临时文件编辑，再请求一个范围明确、原本需授权的无害动作。若 AI 允许，只出现普通执行结果，无额外批准理由/通知；模型选择 needs_user 时应出现人工框，不强求某个真实模型必须允许。
3. 用 `/permissions` 为一个无害命令添加显式 ask，观察仍由人工确认；结束后从同一入口移除测试规则。离开 auto 后不再触发 AI 审批。
4. 在 auto 中进入 plan，再经原计划确认恢复；观察恢复模式和实际行为一致，计划批准本身不交 AI。不要为复现首次确认手动删除真实用户设置。
5. 运行独立测试查看明确通过/失败输出。拒绝、硬停止及故障兜底使用注入测试，不以真实恶意动作、凭据外传或破坏操作验收。

后台子代理真实队列、SDK/远端和费用账单可按环境另行集成验证，不是普通用户必须搭建的验收条件。状态机通过不代表 AI 零误判。当前无新增 HTTP API，无 curl 对接；更完整的阶段覆盖与未验证项见根目录 `precious-crafting-pony.md`。

### 更新/安装依赖

不要直接执行：

```bash
bun add xxx
```

推荐流程如下。

#### 1. 确认要安装的版本

例如要添加：

```text
turndown@7.2.4
```

优先使用 tarball URL 形式：

```json
"turndown": "https://mirrors.cloud.tencent.com/npm/turndown/-/turndown-7.2.4.tgz"
```

#### 2. 手动写入 package.json

在 `dependencies` 中添加：

```json
"turndown": "https://mirrors.cloud.tencent.com/npm/turndown/-/turndown-7.2.4.tgz"
```

不要写成：

```json
"turndown": "*"
```

也尽量不要写成：

```json
"turndown": "^7.2.4"
```

否则后续可能发生依赖漂移。

#### 3. 同步 bun.lock

```bash
bun install --lockfile-only
```

#### 4. 验证安装

```bash
bun ci
bun run version
```

#### 命令说明

- `bun ci`：用于日常安装和验证，会严格按照 `bun.lock` 安装。
- `bun install --lockfile-only`：用于手动修改 `package.json` 后同步 `bun.lock`，不会安装依赖。

### 代理用量接口

当通过 Codex Claude Proxy 调用模型时，CLI 会在每轮对话结束后请求代理的 `GET /v1/usage`。连接和鉴权使用普通用户指南中所列的现有环境变量。

代理接口返回与 Claude Code 用量接口一致的 `Utilization` 结构，额度数据位于 `seven_day.utilization` 和 `seven_day.resets_at`。示例响应：

```json
{
  "five_hour": null,
  "seven_day": {
    "utilization": 15,
    "resets_at": "2026-07-20T00:00:00.000Z"
  },
  "seven_day_oauth_apps": null,
  "seven_day_opus": null,
  "seven_day_sonnet": null,
  "extra_usage": null
}
```

`seven_day.utilization` 表示本周已使用百分比；CLI 将其换算为剩余百分比显示。未配置上述环境变量、代理不支持该接口或请求失败时，CLI 不显示额度提示，不影响正常对话。

### 项目结构

```
src/                    # 核心源码（1,987 个 TS/TSX）
├── tools/              # 最多 51 个静态内置工具（实际数量受运行条件影响）
├── commands/           # 87 个斜杠命令
├── services/           # API / MCP / analytics / autoDream
├── components/         # 148 个终端 UI 组件（React + Ink）
├── hooks/              # 87 个自定义 Hooks
├── assistant/          # KAIROS 助手模式
├── coordinator/        # 多 Agent 协调器
├── bridge/             # 远程控制桥接（31 文件）
├── proactive/          # 主动模式
├── vim/                # Vim 模式引擎
├── voice/              # 语音交互
└── ...
shims/                  # 原生模块兼容替代
vendor/                 # 原生绑定源码
```

### 从源码中发现的 5 大隐藏功能

通过阅读还原后的 1,987 个 TypeScript 源文件，我们发现了大量未公开的隐藏功能。这些功能通过**编译开关**（`feature()`）和**用户类型**（`USER_TYPE`）进行门控，外部发布版中大部分被裁剪。

---

#### 1. [KAIROS — 永不关机的 Claude](docs/02-kairos.md)

> 源码位置：`src/assistant/`、`src/proactive/`、`src/services/autoDream/` · [查看完整分析 →](docs/02-kairos.md)

关掉终端 Claude 还在运行的持久助手模式。

- **跨会话持久运行**：通过 `.claude/settings.json` 的 `assistant: true` 激活，会话状态持久化到磁盘
- **每日日志**：自动在 `<autoMemPath>/logs/YYYY/MM/YYYY-MM-DD.md` 记录工作日志
- **自动做梦（Dream）**：距上次整合超 24 小时且有 5+ 新会话时，后台自动启动记忆整合子代理，分四阶段运行：Orient → Gather → Consolidate → Prune
- **锁机制**：`.consolidate-lock` 文件 + PID 存活检查，防止多进程同时做梦
- **主动模式（Proactive）**：没人说话时自己找活干，没活就调用 `SleepTool` 等着。接收周期性 `<tick>` 提示来检查是否有事可做
- **后台任务**：命令超 15 秒自动丢后台，支持持久 cron 任务（`permanent: true` 不受 7 天过期限制）
- **编译开关**：`feature('KAIROS')`、`feature('KAIROS_BRIEF')`、`feature('KAIROS_CHANNELS')`
- **本地默认值查询**：`tengu_kairos`、`tengu_onyx_plover`（Dream 阈值配置）仍有调用，但已不连接 GrowthBook，不支持远程求值或本地覆盖

---

#### 2. [Coordinator — 多 Agent 编排模式](docs/04-coordinator.md)

> 源码位置：`src/coordinator/` · [查看完整分析 →](docs/04-coordinator.md)

主 Claude 变成纯指挥官，Worker 并行执行任务。

- **角色分离**：Coordinator 只有三个工具——派活（Agent）、通信（SendMessage）、停工（Shutdown）
- **Worker 机制**：Worker 在独立子进程中运行，各自拥有完整工具集
- **核心铁律**：系统提示中明确规定"禁止甩锅式委派"——不能把不清楚的需求直接丢给 Worker
- **任务追踪**：基于文件的共享任务列表（`~/.claude/tasks/`），Coordinator 和 Worker 共同读写
- **编译开关**：`feature('COORDINATOR_MODE')`
- **环境变量**：`CLAUDE_CODE_COORDINATOR_MODE`

---

#### 3. [隐藏命令 & 秘密开关](docs/05-hidden-commands.md)

> 源码位置：`src/commands.ts`、`src/main.tsx` · [查看完整分析 →](docs/05-hidden-commands.md)

隐藏命令、内部命令、编译开关、隐藏 CLI 参数及环境变量统一维护在该文档中。README 的[斜杠命令清单](#斜杠命令清单)仅提供按使用场景分类的速查说明，避免维护两份重复表格。

常见受限能力包括远程控制、持久助手、语音和工作流；它们是否可见取决于构建开关、登录方式、套餐资格和服务端策略。

当前 `INTERNAL_ONLY_COMMANDS` 仅保留 `/init-verifiers`、条件启用的 `/force-snip` 和 `/subscribe-pr`，以及当前还原开发构建不可用的 `/agents-platform`。这些入口仍受内部身份、Demo 模式及各自编译开关约束；已删除的内部命令不再注册。

---

#### 4. [Bridge — 远程遥控终端](docs/06-bridge.md)

> 源码位置：`src/bridge/`（33 个文件） · [查看完整分析 →](docs/06-bridge.md)

从 claude.ai 或手机直接操控本地 CLI。

- **WebSocket 实时连接**：本地 CLI 通过 WebSocket 与 claude.ai 建立双向通道
- **完整远程控制**：远程端可以发送消息、批准权限、查看输出
- **进程间通信**：跨 Claude 会话的消息传递机制
- **状态同步**：`bridgeStatusUtil.ts` 实时同步运行状态
- **权限回调**：`bridgePermissionCallbacks.ts` 远程权限审批
- **编译开关**：`feature('BRIDGE_MODE')`、`feature('DAEMON')`

---

#### 5. [编译开关 + 远程门控](docs/07-feature-gates.md)

原始源码使用编译开关、用户身份和远程配置三层门控。本仓库已移除远程配置及本地覆盖，当前保留编译／身份检查和调用方默认值查询。[查看当前机制 →](docs/07-feature-gates.md)

##### 第一层：编译时开关（`feature()`）

构建时决定代码包含/排除，以下是完整列表：

<details>
<summary>点击展开编译开关列表</summary>

| 开关 | 说明 |
|------|------|
| `KAIROS` | 持久助手模式 |
| `KAIROS_BRIEF` | 简报模式 |
| `KAIROS_CHANNELS` | 通道通知 |
| `KAIROS_GITHUB_WEBHOOKS` | GitHub Webhook |
| `COORDINATOR_MODE` | 多 Agent 编排 |
| `BRIDGE_MODE` | 远程控制桥接 |
| `VOICE_MODE` | 语音交互 |
| `PROACTIVE` | 主动自主模式 |
| `FORK_SUBAGENT` | 子代理分叉 |
| `DAEMON` | 守护进程模式 |
| `UDS_INBOX` | Unix Socket 收件箱 |
| `WORKFLOW_SCRIPTS` | 工作流脚本 |
| `TORCH` | Torch 功能 |
| `MONITOR_TOOL` | 监控工具 |
| `HISTORY_SNIP` | 历史截断 |
| `ANTI_DISTILLATION_CC` | 反蒸馏保护 |
| `BASH_CLASSIFIER` | Bash 命令分类器 |
| `BG_SESSIONS` | 后台会话 |
| `CACHED_MICROCOMPACT` | 缓存微压缩 |
| `COMMIT_ATTRIBUTION` | 提交归属标注 |
| `CONNECTOR_TEXT` | 连接器文本 |
| `CONTEXT_COLLAPSE` | 上下文折叠 |
| `EXPERIMENTAL_SKILL_SEARCH` | 实验性技能搜索 |
| `EXTRACT_MEMORIES` | 自动提取记忆 |
| `FILE_PERSISTENCE` | 文件持久化 |
| `HARD_FAIL` | 硬失败模式 |
| `LODESTONE` | Lodestone 功能 |
| `MCP_SKILLS` | MCP 技能系统 |
| `MESSAGE_ACTIONS` | 消息操作 |
| `NATIVE_CLIENT_ATTESTATION` | 客户端证明 |
| `PROMPT_CACHE_BREAK_DETECTION` | 缓存中断检测 |
| `QUICK_SEARCH` | 快速搜索 |
| `REACTIVE_COMPACT` | 响应式压缩 |
| `SLOW_OPERATION_LOGGING` | 慢操作日志 |
| `STREAMLINED_OUTPUT` | 精简输出 |
| `TEAMMEM` | 团队记忆同步 |
| `TEMPLATES` | 模板/分类器 |
| `TERMINAL_PANEL` | 终端面板 |
| `TOKEN_BUDGET` | Token 预算 |
| `TRANSCRIPT_CLASSIFIER` | 转录分类器 |
| `UNATTENDED_RETRY` | 无人值守重试 |

</details>

##### 第二层：用户类型（`USER_TYPE`）

- **`ant`**（Anthropic 内部）— 仍有部分身份检查，但不会恢复已删除功能或默认关闭的 gate。
- **`external`**（外部用户）— 使用外部身份对应分支。

##### 第三层：本地默认值查询（原 GrowthBook 接口）

`growthbook.ts` 现在直接返回调用方传入的默认值，不请求远程服务，不缓存或定时刷新，也不读取覆盖配置。下列名称仅表示源码中的查询用途，不代表仍有在线 A/B 测试。

| 开关 | 控制内容 |
|------|---------|
| `tengu_kairos` | KAIROS 助手模式开关 |
| `tengu_onyx_plover` | 自动做梦阈值（间隔/会话数） |
| `tengu_cobalt_frost` | 语音识别（Nova 3）开关 |
| `tengu_ant_model_override` | 内部用户模型覆盖 |
| `tengu_session_memory` | 会话记忆功能 |
| `tengu_max_version_config` | 自动更新 Kill Switch |
| `tengu_frond_boric` | 数据接收器 Kill Switch |
| `tengu_herring_clock` | 团队记忆路径 |
| `tengu_sm_config` | 会话记忆配置 |

---

### 隐藏环境变量速查

<details>
<summary>点击展开完整环境变量列表</summary>

| 环境变量 | 说明 |
|----------|------|
| `ANTHROPIC_MODEL` | 模型覆盖 |
| `CLAUDE_CODE_MAX_OUTPUT_TOKENS` | 最大输出 token |
| `CLAUDE_CODE_DISABLE_THINKING` | 禁用思考 |
| `CLAUDE_CODE_PROACTIVE` | 主动模式 |
| `CLAUDE_CODE_COORDINATOR_MODE` | 协调器模式 |
| `CLAUDE_CODE_BRIEF` | 简报模式 |
| `CLAUDE_CODE_USE_BEDROCK` | 使用 AWS Bedrock |
| `CLAUDE_CODE_USE_VERTEX` | 使用 Google Vertex |
| `CLAUDE_CODE_DISABLE_AUTO_MEMORY` | 禁用自动记忆 |
| `CLAUDE_CODE_EXTRA_BODY` | API 附加 JSON |
| `CLAUDE_CODE_SYNTAX_HIGHLIGHT` | 语法高亮主题 |
| `CLAUDE_CODE_IDLE_THRESHOLD_MINUTES` | 空闲阈值（默认 75 分钟） |

</details>

---

### 工具清单与注入机制

工具注册以 `src/tools.ts` 的 `getAllBaseTools()` 为准。当前源码最多注册 **51 个静态内置工具**，MCP Server 还可动态提供任意数量的工具；“源码中存在”“进入候选池”“本次请求发送给模型”是三个不同阶段，不能直接用源码目录数量推断模型实际可见的工具数。

#### 工具如何进入模型上下文

1. **构建期裁剪**：`feature('...')` 决定某些模块是否被打包；未编入当前构建的工具不可能在运行时启用。
2. **候选池注册**：`getAllBaseTools()` 根据构建特性、`USER_TYPE` 和环境变量组成静态候选池。
3. **会话级过滤**：`getTools()` 再应用 Simple/REPL 等运行模式、权限中的整工具 deny 规则，以及每个工具的 `isEnabled()`。
4. **动态合并**：`assembleToolPool()` 合并已连接 MCP Server 的工具；同名时内置工具优先。REPL 通过 `useMergedTools()` 使用该结果，Coordinator 还会再次缩减工具集。
5. **请求级注入**：`toolToAPISchema()` 调用工具的 `prompt()`，生成 `name`、完整操作说明和 `input_schema`，随后 `queryModel()` 把它们放入 Anthropic Messages API 的 `tools` 参数。严格来说，工具定义不是拼接进 `system` 字符串，而是作为与系统提示词并列的 API 工具定义发送。
6. **请求级延迟加载**：本次请求实际启用 `ToolSearch` 时，MCP 工具以及声明了 `shouldDefer: true` 的内置工具，初始通常只通过 `<system-reminder>` 中的 deferred-tools delta（旧路径为 `<available-deferred-tools>`）告知名称、轻量用途和关键边界；模型调用 `ToolSearch` 后得到 `tool_reference`，后续请求才纳入已发现工具的 API 定义，并继续以 `defer_loading: true` 标记。若本次请求未启用工具搜索，这些工具会直接内联，成为本次请求的基础工具。
7. **运行时补充上下文**：团队上下文、团队邮箱、Task V2 提醒、Agent 清单变化和 deferred-tool 名称变化由 `src/utils/attachments.ts` 作为隐藏的用户消息附件注入，不属于工具 Schema。

`description()` 主要用于 UI、工具选择器或摘要；模型在 API 工具定义中读到的长说明来自 `prompt()`。

#### 所有会话都会经过的通用限制

| 限制 | 实际行为 |
|---|---|
| 整工具 deny 规则 | 若权限配置对某工具名或某个 MCP Server 前缀设置无参数的 deny，该工具会在请求前移除，而不只是调用时拒绝。 |
| `CLAUDE_CODE_SIMPLE` | 普通情况下仅留下 `Bash`、`Read`、`Edit`；若同时处于 Coordinator 模式，还加入 `Agent`、`TaskStop`、`SendMessage`。Simple + REPL 模式则用 `REPL` 替代底层原语。 |
| REPL 模式 | `REPL` 启用后，`REPL_ONLY_TOOLS` 中的底层工具不再直接暴露，而由 VM 内的 REPL 包装调用。 |
| Coordinator 模式 | 主协调器只保留 `Agent`、`TaskStop`、`SendMessage`、`StructuredOutput`，以及名称匹配 PR 活动订阅/退订的 MCP 工具。 |
| 子 Agent | 使用独立的 worker 权限上下文重新组装工具池，再按同步/后台、内置/自定义 Agent 类型过滤；MCP 工具通常可保留。 |
| 工具搜索 | `ENABLE_TOOL_SEARCH` 控制 ToolSearch 模式。源码中未设置时为 `tst`（默认开启）；`false` 或 `auto:100` 为 `standard`（关闭）；`true` 或 `auto:0` 为 `tst`（强制开启）；`auto`/`auto:1..99` 为 `tst-auto`，按延迟工具完整定义的总量决定。 |
| 工具搜索兼容性 | `CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS` 会强制切为 `standard`；不支持 `tool_reference` 的模型（默认名称匹配 Haiku）关闭；`ToolSearch` 被权限或 Agent 过滤移除时也关闭。使用非 Anthropic 官方地址的 `ANTHROPIC_BASE_URL` 时，若 `ENABLE_TOOL_SEARCH` 未设置或为空，候选池阶段默认关闭；显式设置任意非空值仅表示代理声明兼容，仍须通过请求级条件。 |

下表中的“直接”表示通过以上过滤后，完整工具说明和参数 Schema 从本次 API 请求直接发送；“按需”表示工具进入候选池后不会立即发送完整 Schema：工具搜索开启时，模型先看到工具名称和轻量用途提示，并在判断当前任务需要该工具时通过 `ToolSearch` 查询；查询返回 `tool_reference`，后续请求仅纳入已经发现的工具，并保留 `defer_loading: true` 标记。工具搜索在配置关闭、实验 Beta 总开关关闭、模型不支持 `tool_reference`、`ToolSearch` 被权限移除，或 `auto` 模式未达到阈值等情况下，会对本次请求关闭，此时按需工具退化为直接发送。各按需项同时说明通常触发查询的任务时机。

缓存测试结论：在当前代理链路中，首次加载延迟工具会使请求工具数增加并造成一次 Prompt Cache 未命中；工具列表稳定后随即恢复命中。因此延迟工具系统不会持续破坏缓存，但首次加载每种新工具可能产生一次缓存失效。此现象属于当前代理对 `defer_loading`/`tool_reference` 的实际处理结果，不应直接等同于 Anthropic 原生 API 的行为。

#### ToolSearch 模式与实际启用条件

`ToolSearch` 的模式由环境变量 `ENABLE_TOOL_SEARCH`（注意末尾为 `H`）决定；`standard` 仅是“传统直接注入”的内部模式名，不会把 `ToolSearch`、`tool_reference` 或 `defer_loading` 发送至 API。

| 配置 | 模式 | 行为 |
|---|---|---|
| `CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS` 为真 | `standard` | 强制关闭，无视 `ENABLE_TOOL_SEARCH`。 |
| `ENABLE_TOOL_SEARCH=false` 或 `auto:100` | `standard` | 关闭。所有可延迟工具直接携带完整 Schema。 |
| `ENABLE_TOOL_SEARCH=true` 或 `auto:0` | `tst` | 强制启用，仍需满足下列请求级 gate。 |
| `ENABLE_TOOL_SEARCH=auto` | `tst-auto` | 仅当可延迟工具的完整定义总量达到模型上下文窗口的默认 **10%** 时启用。 |
| `ENABLE_TOOL_SEARCH=auto:N`（`N=1..99`） | `tst-auto` | 仅当定义总量达到模型上下文窗口的 `N%` 时启用。 |
| 未设置 | `tst` | 源码默认启用；但 First-party provider 使用非官方 `ANTHROPIC_BASE_URL` 时，候选池阶段默认关闭。 |

模式不是最终结果。每个 API 请求还必须同时满足：当前模型支持 `tool_reference`（默认 Haiku 不支持；`tengu_tool_search_unsupported_models` 采用调用方默认列表）、`ToolSearch` 未被权限或 Agent 类型过滤移除，以及本次存在可延迟工具或仍在连接的 MCP Server。`tst-auto` 还必须通过相应阈值检查。任一条件不满足，当前请求都回退为 `standard` 行为。

当 ToolSearch 关闭时，`ToolSearch` 自身会从 API 工具列表移除；其余 MCP 工具和标记 `shouldDefer: true` 的内置工具**不会被移除**，而是以完整 `prompt()` 和 `input_schema` 直接注入。因此它们在该请求中属于基础工具，不需要先经 ToolSearch 发现。`alwaysLoad: true` 的 MCP 工具本来就不延迟，关闭 ToolSearch 时没有额外差异。

当 ToolSearch 开启时，MCP 工具默认延迟，内置工具仅在 `shouldDefer: true` 时延迟；`alwaysLoad: true` 的 MCP 工具、ToolSearch 自身，以及运行时强制直出的通信类工具例外。模型通过 ToolSearch 获得 `tool_reference` 后，已发现的工具才会在后续请求携带完整定义。

#### 基础注册工具

基础注册工具由 `getAllBaseTools()` 无条件加入候选池；通过运行模式、权限和 Agent 类型过滤后，直接以完整 Schema 发送。它们不依赖 ToolSearch，ToolSearch 开关只会影响下节中声明 `shouldDefer: true` 的工具以及 MCP 工具。

| 工具 | 作用 | 直接注入说明 |
|---|---|---|
| `Agent`（旧别名 `Task`） | 启动同步或后台子代理，支持模型选择和 worktree 隔离；在已有 Team 上下文中传 `name` 时创建持久队友。 | 启用 fork-subagent 时明确禁止延迟。Agent 类型清单默认写入 `prompt()`；若 `CLAUDE_CODE_AGENT_LIST_IN_MESSAGES` 或 `tengu_agent_list_attach` 开启，则改由 `agent_listing_delta` 附件动态注入。 |
| `Bash` | 执行 Shell 命令，支持权限、沙箱和后台运行。 | 直接注入。 |
| `Read`、`Edit`、`Write` | 读取文件、精确编辑现有文件、创建或完整覆盖文件。 | 直接注入。 |
| `Skill` | 加载并执行已安装 Skill。 | 直接注入；可用 Skill 清单另由会话提醒注入。 |
| `SendMessage` | 向队友、团队广播或受支持的本地/远程收件箱发送消息，并处理旧版 shutdown/plan-approval 协议。 | 明确不延迟，保证控制消息可随时发送和响应。 |

`Glob` 和 `Grep` 也直接注入，但仅在 `hasEmbeddedSearchTools()` 为 false 时注册；含内嵌 `bfs` 搜索能力的构建不注册这两个专用工具。

#### 延迟注册工具

延迟注册工具先满足自身的条件才进入候选池，随后分为两类：**条件注册**工具受运行时、会话或构建条件控制，但一旦进入候选池便直接注入；**ToolSearch 注册**工具在本次请求启用 ToolSearch 时延迟加载，关闭时直接注入。

##### 条件注册（直接注入）

| 工具 | 注册条件 | 作用与注入说明 |
|---|---|---|
| `TeamCreate`、`TeamDelete` | `isAgentSwarmsEnabled()` 且用户已执行 `/team on`。 | Team 专属工具；当前会话从下一次输入起直接注入，不经过 ToolSearch。 |
| `SendUserMessage`（源码对象 `BriefTool`） | 构建包含 `KAIROS` 或 `KAIROS_BRIEF`；Assistant 模式已激活或用户主动 opt-in，且通过 `tengu_kairos_brief` gate。 | 直接注入。 |
| `TodoWrite` | `isTodoV2Enabled()` 为 false。 | 旧版轻量待办工具（Task V1）；与 Task V2 工具互斥，实际注入受 ToolSearch 规则影响，详见下一节。 |
| `TaskCreate`、`TaskGet`、`TaskUpdate`、`TaskList` | `isTodoV2Enabled()` 为 true。 | Task V2 工具；与 `TodoWrite` 互斥，实际注入还受 ToolSearch 规则影响，详见下一节。 |
| `ToolSearch` | 候选池通过 `isToolSearchEnabledOptimistic()`。 | 本次请求实际启用时直接注入；否则从 API 工具列表移除。 |

`TodoWrite` 与 Task V2 互斥：交互式会话默认启用 Task V2；非交互式默认回退到 `TodoWrite`，除非设置 truthy 的 `CLAUDE_CODE_ENABLE_TASKS`。

##### ToolSearch 注册（开启时延迟，关闭时直接）

下列内置工具声明了 `shouldDefer: true`。它们先按各自注册条件进入候选池；若本次请求实际启用 ToolSearch，则仅公布轻量用途并按需发现；若关闭，则与基础工具一样直接发送完整 Schema。

| 工具 | 候选池/额外启用条件 | 常见使用时机 |
|---|---|---|
| `TaskOutput` | 基础注册。 | 需要等待或查看仍在运行、且没有可直接读取输出文件的后台任务。 |
| `NotebookEdit` | 基础注册。 | 修改 `.ipynb` 的指定单元格；只读取 Notebook 时使用 `Read`。 |
| `WebFetch` | 基础注册。 | 用户提供需要读取、摘取或分析的具体公开 URL。 |
| `WebSearch` | First-party 和 Foundry 启用，Vertex 仅 Claude 4 系列启用，其他 Provider 禁用。 | 需要获取时效资料、当前事件或先发现网页来源。 |
| `TaskStop`（旧别名 `KillShell`） | 基础注册。 | 取消后台 Shell 或 Agent。 |
| `AskUserQuestion` | 启用 KAIROS/KAIROS_CHANNELS 且存在远程 channel 时禁用。 | 存在会影响实现方向、无法从上下文确定的选项。 |
| `EnterPlanMode`、`ExitPlanMode` | 与 `AskUserQuestion` 使用相同的 channel 禁用条件。 | 进入计划模式，或在计划写完后请求实现批准。 |
| `TodoWrite` | 仅 `isTodoV2Enabled()` 为 false。 | 旧任务系统可用且工作值得跟踪。 |
| `TaskCreate`、`TaskGet`、`TaskUpdate`、`TaskList` | `isTodoV2Enabled()` 为 true。 | 创建、查询、更新和列出结构化任务。 |
| `EnterWorktree`、`ExitWorktree` | `isWorktreeModeEnabled()` 为 true；实际调用还要求本会话已创建 worktree 等前置条件。 | 用户明确要求创建、进入或离开 worktree。 |

#### 编译注册工具

以下工具受 `feature('...')`、构建产物、内部用户身份或平台限制。它们是否被打包和注册先于上述基础/延迟分类；满足构建及运行时条件后，再按工具本身的 ToolSearch 属性决定直接或延迟注入。

| 工具 | 编译或平台注册条件 | 注入说明 |
|---|---|---|
| `Config` | `USER_TYPE === 'ant'`。 | `shouldDefer: true`；ToolSearch 关闭时直接注入。 |
| `SuggestBackgroundPR` | `USER_TYPE === 'ant'` 且模块可加载。 | 直接注入。 |
| `WebBrowser`、`terminal_capture`、`ListPeers` | 分别要求 `WEB_BROWSER_TOOL`、`TERMINAL_PANEL`、`UDS_INBOX` 构建功能。 | 直接注入。 |
| `LSP` | truthy 的 `ENABLE_LSP_TOOL`，并通过自身 `isEnabled()`。 | `shouldDefer: true`；ToolSearch 关闭时直接注入。 |
| `REPL`、`workflow`、`Sleep` | 分别要求对应 REPL、`WORKFLOW_SCRIPTS`、`PROACTIVE` 或 `KAIROS` 构建功能。 | 直接注入；REPL 生效时替换一组底层原语。 |
| `CronCreate`、`CronDelete`、`CronList` | `AGENT_TRIGGERS` 构建功能、未开启 `CLAUDE_CODE_DISABLE_CRON` 且 `tengu_kairos_cron` 为 true。 | `shouldDefer: true`；ToolSearch 关闭时直接注入。 |
| `RemoteTrigger` | `AGENT_TRIGGERS_REMOTE` 构建功能、`tengu_surreal_dali` 为 true 且策略允许远程会话。 | `shouldDefer: true`；实际调用还要求 OAuth 和组织 ID。 |
| `Monitor`、`send_user_file`、`PushNotification`、`SubscribePR`、`snip` | 分别要求对应构建模块；`MonitorTool` 当前为 `null`，不会注册。 | 除 `send_user_file` 在 Bridge 活跃时强制直接外，其余直接注入。 |
| `PowerShell` | Windows；内部用户默认开启，外部用户须设 truthy `CLAUDE_CODE_USE_POWERSHELL_TOOL`。 | 直接注入。 |
| `TestingPermissionTool` | `NODE_ENV === 'test'`。 | 直接注入。 |

MCP 工具不属于静态内置注册：连接成功后由 `tools/list` 动态加入，详见“MCP 工具与资源辅助工具”。

两者解决的问题层级不同：`TodoWrite` 是由单个 Agent 整体重写的一张轻量会话清单；Task V2 将每项工作保存为带唯一 ID 的独立任务，可单独查询和更新，并支持负责人、阻塞依赖、metadata、磁盘持久化及 Team 共享。保留两套主要是为了让非交互式 CLI 和 SDK 继续兼容旧工具名及输入 Schema，同时让交互式会话和多 Agent 协作使用能力更完整的新任务系统。

##### TodoWrite 与 Task V2 的使用场景

| 场景 | 使用的工具 | 原因 |
|---|---|---|
| 普通交互式 Claude Code 会话 | Task V2 | 默认启用，可按任务 ID 精确更新，适合跟踪当前编码任务。 |
| Agent Team 协作 | Task V2 | 多个 Agent 需要共享任务、设置 `owner`、声明 `blocks`/`blockedBy` 并避免整体清单相互覆盖。 |
| 任务之间存在先后依赖 | Task V2 | 可明确记录阻塞关系，并通过 `TaskList` 找到已经解除阻塞的工作。 |
| 任务需要跨进程读取或恢复 | Task V2 | 每个任务独立持久化到 `~/.claude/tasks/<任务列表ID>/`。 |
| `claude -p`、SDK 等非交互式调用 | `TodoWrite`（默认） | 保持旧版工具名和输入 Schema 兼容，调用方无须立即适配四个 Task V2 工具。 |
| 非交互式调用需要任务分派、依赖或持久化 | Task V2 | 设置 truthy 的 `CLAUDE_CODE_ENABLE_TASKS` 后显式启用新版工具。 |
| 单个 Agent 只需展示简单步骤清单 | `TodoWrite`（仅在其可用的会话中） | 一次提交完整 `todos` 数组即可更新清单，不需要负责人和依赖模型。 |
| 单一、简单、可立即完成的工作 | 两者都不使用 | 工具提示均要求避免为没有跟踪价值的简单任务创建清单。 |

选择原则：**由运行模式决定默认工具，不需要人为同时选择**。模型应在当前会话提供的工具中使用对应的一套；只有非交互式调用方确实需要 Task V2 能力时，才设置 `CLAUDE_CODE_ENABLE_TASKS=1`。`TodoWrite` 每次调用会替换完整数组，更适合单 Agent；Task V2 按任务 ID 增量修改，更适合持久化和协作，但一次完整操作通常需要多次工具调用。

#### Team 工具（当前实现）

Team 不再受实验功能开关限制，但 `TeamCreate` 和 `TeamDelete` 默认不进入工具池，也不会通过 `ToolSearch` 公布或加载。执行 `/team`（等价于 `/team on`）代表用户明确授权在当前会话使用 Team，并将这两个 Team 专属工具的完整说明及 Schema 直接提供给模型；`/team off` 将它们移出工具池，`/team status` 查看状态，`/clear` 会关闭该会话模式。`Agent`、`SendMessage` 和 Task V2 等原有基础工具的注册与延迟策略不受 `/team` 影响。普通、独立的并行调查仍应优先使用多个一次性 `Agent`，不能仅因任务较大就创建 Team。

| 工具 | 作用与调用条件 | 注入时机 |
|---|---|---|
| `TeamCreate` | 创建持久协作 Team 及共享任务目录。执行 `/team` 已代表用户授权，无需再通过 `AskUserQuestion` 确认；必须先单独成功创建 Team，之后才能创建共享任务或通过 `Agent(name, team_name)` 启动队友。一个 lead 不能同时领导多个 Team。 | 默认不注册；执行 `/team` 后在当前会话**直接**注入，不经过 `ToolSearch`。成功调用后，返回结果会把活跃 Team 操作契约直接补充给模型；团队上下文随后还会通过附件持续注入。 |
| `TeamDelete` | 清理 Team、任务目录、邮箱和上下文。删除前必须先关闭或移除全部非 lead 注册成员，idle 成员也算；否则拒绝删除。 | 默认不注册；执行 `/team` 后在当前会话**直接**注入，不经过 `ToolSearch`。仅用于已创建 Team 的生命周期末尾。 |
| `SendMessage` | 按队友名投递，`*` 表示广播；结构化 shutdown/plan-approval 消息有额外目标限制。 | **直接**，无须先经 `ToolSearch`。Team 创建后，邮箱消息作为附件在后续轮次注入。 |
| `Agent` | 无 `name` 时是有界的一次性子代理；有活跃 Team 且传入 `name` 时才进入持久队友分支。队友不能再创建队友，但可省略 `name` 启动同步子代理。 | **直接**。 |

Team 下的 Task ID 解析顺序为：`CLAUDE_CODE_TASK_LIST_ID` → 进程内队友所属 Team → `CLAUDE_CODE_TEAM_NAME` → lead 当前 Team → 当前 Session。因而 lead 与队友默认共享同一任务表。

#### MCP 工具与资源辅助工具

MCP Server 连接成功后，通过 `tools/list` 返回的工具动态加入工具池，通常命名为：

```text
mcp__<服务器名>__<工具名>
```

MCP 工具的“默认按需”仅在**本次请求实际启用 ToolSearch**时成立：首次公布名称以及可用的轻量用途提示，经 `ToolSearch` 返回 `tool_reference` 后，完整 Schema 才在后续请求发送；若服务端通过 `_meta['anthropic/alwaysLoad']` 设置 `alwaysLoad: true`，则改为直接注入。ToolSearch 关闭（包括当前代理环境使用非官方 `ANTHROPIC_BASE_URL` 且未显式设置 `ENABLE_TOOL_SEARCH` 的常见情形）时，所有 MCP 工具均直接内联。

| 工具 | 启用条件 | 注入时机 |
|---|---|---|
| `ListMcpResourcesTool` | 至少一个已连接 MCP Server 声明 `capabilities.resources`；全局只追加一组资源辅助工具。 | **按需**：任务需要发现已连接 MCP Server 提供了哪些可读资源时查询。它虽然列在 `getAllBaseTools()`，但会被 `getTools()` 的 special-tools 过滤，随后仅由 MCP 连接流程动态加入。 |
| `ReadMcpResourceTool` | 与 `ListMcpResourcesTool` 相同。 | **按需**：已知或刚列出目标 MCP 资源，需要读取其内容时查询。 |
| `mcp__*` | 对应 MCP Server 已配置、连接成功并通过 `tools/list` 返回该工具，同时未被权限 deny。 | ToolSearch 实际开启时默认按需，模型根据名称或轻量用途提示发现；`alwaysLoad: true` 时直接。关闭时直接注入完整 Schema。晚连接、断线重连或工具列表变化会通过 MCP/deferred-tools delta 附件更新模型可见名称。 |

因此，更准确的数量表达是：**最多 51 个静态注册项，加上 N 个动态 MCP 工具，但每次请求只发送通过全部 gate 且当前需要的子集**。

#### 主会话与子 Agent 的注入差异

- 主 REPL：`useMergedTools()` → `assembleToolPool()` → `mergeAndFilterTools()` → `queryModel()` → `toolToAPISchema()` → API `tools`。
- 普通同步子 Agent：重新组装 worker 工具池；默认移除 `TaskOutput`、计划模式工具、`AskUserQuestion`、`TaskStop`，外部构建还会移除递归 `Agent`。
- 普通后台 Agent：进一步只保留后台白名单中的文件、搜索、Shell、Skill、ToolSearch、worktree 等工具；MCP 工具在基础过滤中例外放行。
- 进程内 Team 队友：除后台白名单外，还会在 Agent 过滤层放行共享的 `TaskCreate`、`TaskGet`、`TaskUpdate`、`TaskList` 和 `SendMessage`；Task 工具仍遵循请求级 ToolSearch 延迟规则，并非必然直接注入。队友可启动同步子 Agent，但不能启动后台 Agent 或继续创建队友；若处于 plan 权限模式，可额外获得 `ExitPlanMode`。
- Coordinator：只负责分派和输出，不直接获得常规文件/Shell 工具；worker 再按自己的权限上下文取得执行工具。

关键实现位置：

- 静态注册和会话过滤：`src/tools.ts`
- 工具接口、`prompt()` 与 `description()`：`src/Tool.ts`
- 主 REPL 合并：`src/hooks/useMergedTools.ts`
- Coordinator 过滤：`src/utils/toolPool.ts`、`src/constants/tools.ts`
- 子 Agent 过滤：`src/tools/AgentTool/agentToolUtils.ts`
- API Schema 生成：`src/utils/api.ts` 的 `toolToAPISchema()`
- 请求级延迟加载：`src/utils/toolSearch.ts`、`src/tools/ToolSearchTool/prompt.ts`、`src/services/api/claude.ts`
- 动态提醒和上下文附件：`src/utils/attachments.ts`
- MCP 工具和资源辅助工具注入：`src/services/mcp/client.ts`
- Team 生命周期：`src/tools/TeamCreateTool`、`src/tools/TeamDeleteTool`、`src/tools/SendMessageTool`
- Task V2 启用和共享任务表：`src/utils/tasks.ts`

---

### REPL 模块说明

`src/screens/REPL.tsx` 是 CLI 的主交互界面，负责会话状态、用户输入、模型查询、工具权限、消息显示及各类终端弹窗。导入较多，按职责可归纳如下：

| 模块类别 | 主要引入 | 用途 |
| --- | --- | --- |
| 运行时与 Node API | `react/compiler-runtime`、`bun:bundle`、`child_process`、`path`、`os`、`fs/promises`、`crypto` | React 编译产物支持、功能开关、子进程、文件路径/临时文件、文件写入及 UUID。 |
| React 与 Ink | `react`、`../ink.js`、`figures` | 管理组件状态/副作用，渲染终端 UI，处理键盘输入、终端尺寸、主题、焦点和终端标题。 |
| 会话与上下文 | `bootstrap/state`、`sessionStorage`、`sessionRestore`、`conversationRecovery`、`claudemd`、`plans` | 保存/恢复会话、消息、成本、工作树、计划、内存文件与上下文。 |
| 模型查询与消息 | `query`、`handlePromptSubmit`、`utils/messages`、`messageQueueManager`、`QueryGuard`、`queryProfiler` | 提交用户输入、调用模型、处理流式响应、维护消息队列、避免并发查询并记录性能。 |
| 输入与快捷键 | `PromptInput`、`useSearchInput`、`inputModes`、`GlobalKeybindingHandlers`、`CommandKeybindingHandlers`、`KeybindingSetup` | 输入框、搜索、Vim/输入模式、全局和命令快捷键及快捷键上下文。 |
| 消息与全屏显示 | `Messages`、`FullscreenLayout`、`VirtualMessageList`、`ScrollKeybindingHandler`、`messageActions`、`MessageSelector` | 显示会话消息、虚拟滚动、全屏模式、消息选择/复制/编辑等操作。 |
| 命令、技能和插件 | `commands`、`useMergedCommands`、`useSkillsChange`、`useManagePlugins`、`performStartupChecks` | 聚合斜杠命令，监听技能变化，管理插件并执行启动检查。 |
| 工具与权限 | `tools`、`useMergedTools`、`useCanUseTool`、`PermissionRequest`、`PermissionUpdate`、`SandboxPermissionRequest` | 组装工具池，判断工具可用性，展示权限请求并持久化权限更新；处理沙箱权限。 |
| MCP 与 IDE | `MCPConnectionManager`、`useMergedClients`、`ElicitationDialog`、`useIDEIntegration`、`useIdeSelection` | 连接和合并 MCP 服务，处理 MCP 信息征询，以及 IDE 集成、选区和状态。 |
| Agent 与协作 | `AgentTool/*`、`InProcessTeammateTask`、`LocalAgentTask`、`useSwarmInitialization`、`useInboxPoller` | 加载/恢复 Agent，管理本地与进程内队友任务、权限同步、收件箱和协作状态。 |
| 压缩、令牌与成本 | `compact/*`、`tokenBudget`、`tokens`、`cost-tracker`、`CostThresholdDialog` | 计算令牌预算与上下文窗口，执行压缩，记录会话成本并展示成本提醒。 |
| 文件与编辑器 | `fileHistory`、`fileStateCache`、`attachments`、`editor`、`exportRenderer` | 保存文件快照/回退，缓存读取状态，创建附件，导出消息文本并调用外部编辑器。 |
| 通知与提示 | `notifications`、`notifier`、`hooks/notifs/*`、`tips/*` | 展示终端/系统通知、设置和网络状态、限流、升级、插件、IDE 等提示。 |
| 会话生命周期 | `sessionStart`、`hooks`、`ExitFlow`、`gracefulShutdown`、`preventSleep`、`backgroundHousekeeping` | 执行会话开始/结束钩子，处理退出、后台清理和防止系统休眠。 |
| 远程与后台会话 | `useRemoteSession`、`useSSHSession`、`useDirectConnect`、`LocalMainSessionTask`、`useSessionBackgrounding` | 提供远程/SSH/直连会话能力，并支持将主会话转入后台。 |
| 配置、实验与遥测 | `config`、`analytics/*`、`diagnosticTracking`、`sessionTracing`、`activityManager` | 读写用户配置、查询固定默认值，保留本地诊断、用户配置的遥测及活动状态；不包含官方统计上传。 |
| 条件加载模块 | `useVoiceIntegration`、`coordinatorMode`、`proactive/*`、`WebBrowserPanel` | 通过 `feature(...)` 或内部构建条件按需 `require`，使未启用功能可被构建工具剔除。 |
| 其他界面能力 | `Spinner`、`TaskListV2` | 显示加载状态及任务列表。 |

## 数据来源

- npm 包：[@anthropic-ai/claude-code](https://www.npmjs.com/package/@anthropic-ai/claude-code)
- 还原方式：提取 `cli.js.map` 中的 `sourcesContent`

## 声明

- 源码版权归 [Anthropic](https://www.anthropic.com) 所有
- 仅用于技术研究与学习，请勿用于商业用途
- 如有侵权，请联系删除
