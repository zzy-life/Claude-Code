# Claude Code 源码还原

> 从 `@anthropic-ai/claude-code` npm 包的 source map 中还原的完整 TypeScript 源码，**可本地运行**

<p align="center">
  <img src="preview.png?raw=true" alt="Claude Code CLI" width="700">
</p>

> [!WARNING]
> 本仓库为**非官方**版本，基于公开 npm 发布包 source map 还原，**仅供研究学习**。源码版权归 [Anthropic](https://www.anthropic.com) 所有。

---

## 快速开始

### 安装 Bun

项目建议使用 Bun 1.3.5，并需要 Node.js ≥ 20.19。

```bash
npm install -g bun@1.3.5
```

Windows PowerShell：

```powershell
iex "& {$(irm https://bun.com/install.ps1)} -Version 1.3.5"
```

### 终端用户使用

```bash
npm install -g @zzy1998/claude-code
cc
```


### 本地安装并运行

```bash
bun ci            # 安装依赖（需要 Bun ≥ 1.3.5、Node.js ≥ 20.19）
bun run dev       # 启动 CLI
bun run version   # 验证版本
```

> 日常安装请使用 `bun ci`，不要使用普通 `bun install`，避免依赖重新解析后发生版本漂移。

### Codex Claude Proxy 剩余额度提示

当通过 Codex Claude Proxy 调用模型时，CLI 会在每轮对话结束后请求代理的 `GET /v1/usage`，并在输入框左下角显示：

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
cc proxy config set <代理地址> <你的密钥>
```

该命令会将指定的 HTTP 或 HTTPS 代理地址写入 `ANTHROPIC_BASE_URL`，并同时设置 `ANTHROPIC_AUTH_TOKEN`、`ANTHROPIC_API_KEY` 和 `CLAUDE_CODE_AUTO_COMPACT_WINDOW=258000`。它会保留 `~/.claude/settings.json` 中的其他配置，清除可能覆盖代理模型设置的 `ANTHROPIC_DEFAULT_HAIKU_MODEL`、`ANTHROPIC_DEFAULT_OPUS_MODEL`、`ANTHROPIC_DEFAULT_SONNET_MODEL` 及 `ANTHROPIC_MODEL`。配置完成后重启 Claude Code 生效。

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

`seven_day.utilization` 表示本周已使用百分比；CLI 将其换算为剩余百分比显示。每轮对话结束后，额度右侧还会显示当前会话的上下文占用和可用窗口，例如 `ctx 123k/160k`；分母复用自动压缩的有效窗口计算，会应用 `CLAUDE_CODE_AUTO_COMPACT_WINDOW` 并扣除摘要预留 token。未配置上述环境变量、代理不支持该接口或请求失败时，CLI 不显示额度提示，不影响正常对话。




### npm 全局安装

```powershell
npm install -g @zzy1998/claude-code
cc
```


### 更新/安装依赖

不要直接执行：

​```bash
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

---

## 从源码中发现的 7 大隐藏功能

通过阅读还原后的 1,987 个 TypeScript 源文件，我们发现了大量未公开的隐藏功能。这些功能通过**编译开关**（`feature()`）和**用户类型**（`USER_TYPE`）进行门控，外部发布版中大部分被裁剪。

---

### 1. [BUDDY — AI 电子宠物](docs/01-buddy.md)

> 源码位置：`src/buddy/` · [查看完整分析 →](docs/01-buddy.md)

终端里的拓麻歌子！一个完整的虚拟宠物系统。

- **18 种物种**：鸭子、鹅、猫、龙、章鱼、猫头鹰、企鹅、乌龟、蜗牛、幽灵、六角恐龙、水豚、仙人掌、机器人、兔子、蘑菇、果冻、胖猫
- **5 级稀有度**：普通(60%) → 非凡(25%) → 稀有(10%) → 史诗(4%) → 传说(1%)
- **1% 闪光概率**：独立于稀有度，任何宠物都有 1% 概率成为闪光个体
- **确定性生成**：使用账号 UUID + 固定盐值 `'friend-2026-401'` 经 FNV-1a 哈希 → Mulberry32 PRNG，每人只会得到一只固定的宠物，改配置也没用
- **外观系统**：6 种眼睛样式 + 8 种帽子（皇冠、巫师帽、光环等），common 稀有度没有帽子
- **交互**：`/buddy pet` 抚摸（爱心动画）、`/buddy hatch` 孵化、`/buddy card` 查看卡片
- **动画**：500ms 帧率的 ASCII 精灵动画，气泡对话，窄终端自动退化为表情文字脸（如 `=·ω·=`）
- **编译开关**：`feature('BUDDY')`

---

### 2. [KAIROS — 永不关机的 Claude](docs/02-kairos.md)

> 源码位置：`src/assistant/`、`src/proactive/`、`src/services/autoDream/` · [查看完整分析 →](docs/02-kairos.md)

关掉终端 Claude 还在运行的持久助手模式。

- **跨会话持久运行**：通过 `.claude/settings.json` 的 `assistant: true` 激活，会话状态持久化到磁盘
- **每日日志**：自动在 `<autoMemPath>/logs/YYYY/MM/YYYY-MM-DD.md` 记录工作日志
- **自动做梦（Dream）**：距上次整合超 24 小时且有 5+ 新会话时，后台自动启动记忆整合子代理，分四阶段运行：Orient → Gather → Consolidate → Prune
- **锁机制**：`.consolidate-lock` 文件 + PID 存活检查，防止多进程同时做梦
- **主动模式（Proactive）**：没人说话时自己找活干，没活就调用 `SleepTool` 等着。接收周期性 `<tick>` 提示来检查是否有事可做
- **后台任务**：命令超 15 秒自动丢后台，支持持久 cron 任务（`permanent: true` 不受 7 天过期限制）
- **编译开关**：`feature('KAIROS')`、`feature('KAIROS_BRIEF')`、`feature('KAIROS_CHANNELS')`
- **远程开关**：GrowthBook `tengu_kairos`、`tengu_onyx_plover`（Dream 阈值配置）

---

### 3. [ULTRAPLAN — 云端深度规划](docs/03-ultraplan.md)

> 源码位置：`src/commands/ultraplan.tsx`、`src/utils/ultraplan/` · [查看完整分析 →](docs/03-ultraplan.md)

把难题甩给云端 Opus 独立研究最长 30 分钟。

- **流程**：`/ultraplan <prompt>` → 创建远程 CCR 会话 → Opus 模型独立研究 → 后台轮询等待（30 分钟超时）→ 浏览器查看/修改方案 → 批准执行或传送回本地
- **关键词触发**：消息中包含 "ultraplan" 自动触发，智能排除引号/路径/标识符中的误触发
- **传送（Teleport）**：`src/utils/teleport.tsx` 实现本地 ↔ 远程会话传输，支持 Git Bundle 打包代码上下文
- **完全内部限定**：`isEnabled: () => "external" === 'ant'`，外部版永远不可用
- **编译开关**：`feature('ULTRAPLAN')`
- **远程开关**：`tengu_ultraplan_model`（控制使用的模型）

---

### 4. [Coordinator — 多 Agent 编排模式](docs/04-coordinator.md)

> 源码位置：`src/coordinator/` · [查看完整分析 →](docs/04-coordinator.md)

主 Claude 变成纯指挥官，Worker 并行执行任务。

- **角色分离**：Coordinator 只有三个工具——派活（Agent）、通信（SendMessage）、停工（Shutdown）
- **Worker 机制**：Worker 在独立子进程中运行，各自拥有完整工具集
- **核心铁律**：系统提示中明确规定"禁止甩锅式委派"——不能把不清楚的需求直接丢给 Worker
- **任务追踪**：基于文件的共享任务列表（`~/.claude/tasks/`），Coordinator 和 Worker 共同读写
- **编译开关**：`feature('COORDINATOR_MODE')`
- **环境变量**：`CLAUDE_CODE_COORDINATOR_MODE`

---

### 5. [隐藏命令 & 秘密开关](docs/05-hidden-commands.md)

> 源码位置：`src/commands.ts`、`src/main.tsx` · [查看完整分析 →](docs/05-hidden-commands.md)

隐藏命令、内部命令、编译开关、隐藏 CLI 参数及环境变量统一维护在该文档中。README 的[斜杠命令清单](#斜杠命令清单)仅提供按使用场景分类的速查说明，避免维护两份重复表格。

常见受限能力包括远程控制、持久助手、语音、工作流、宠物和云端深度规划；它们是否可见取决于构建开关、登录方式、套餐资格和服务端策略。

---


---

### 6. [Bridge — 远程遥控终端](docs/06-bridge.md)

> 源码位置：`src/bridge/`（33 个文件） · [查看完整分析 →](docs/06-bridge.md)

从 claude.ai 或手机直接操控本地 CLI。

- **WebSocket 实时连接**：本地 CLI 通过 WebSocket 与 claude.ai 建立双向通道
- **完整远程控制**：远程端可以发送消息、批准权限、查看输出
- **进程间通信**：跨 Claude 会话的消息传递机制
- **状态同步**：`bridgeStatusUtil.ts` 实时同步运行状态
- **权限回调**：`bridgePermissionCallbacks.ts` 远程权限审批
- **编译开关**：`feature('BRIDGE_MODE')`、`feature('DAEMON')`

---

### 7. [50 个编译开关 + 远程门控](docs/07-feature-gates.md)

外部发布版是**阉割版**。Anthropic 通过三层门控控制功能。[查看完整分析 →](docs/07-feature-gates.md)

#### 第一层：编译时开关（`feature()`，约 50 个）

构建时决定代码包含/排除，以下是完整列表：

<details>
<summary>点击展开全部 50 个编译开关</summary>

| 开关 | 说明 |
|------|------|
| `BUDDY` | 宠物伴侣系统 |
| `KAIROS` | 持久助手模式 |
| `KAIROS_BRIEF` | 简报模式 |
| `KAIROS_CHANNELS` | 通道通知 |
| `KAIROS_GITHUB_WEBHOOKS` | GitHub Webhook |
| `ULTRAPLAN` | 云端深度规划 |
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
| `CCR_REMOTE_SETUP` | Web 远程设置 |
| `CHICAGO_MCP` | MCP 扩展（Computer Use） |
| `COMMIT_ATTRIBUTION` | 提交归属标注 |
| `CONNECTOR_TEXT` | 连接器文本 |
| `CONTEXT_COLLAPSE` | 上下文折叠 |
| `COWORKER_TYPE_TELEMETRY` | 协作者遥测 |
| `DOWNLOAD_USER_SETTINGS` | 下载用户设置 |
| `EXPERIMENTAL_SKILL_SEARCH` | 实验性技能搜索 |
| `EXTRACT_MEMORIES` | 自动提取记忆 |
| `FILE_PERSISTENCE` | 文件持久化 |
| `HARD_FAIL` | 硬失败模式 |
| `LODESTONE` | Lodestone 功能 |
| `MCP_SKILLS` | MCP 技能系统 |
| `MEMORY_SHAPE_TELEMETRY` | 记忆形状遥测 |
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
| `UPLOAD_USER_SETTINGS` | 上传用户设置 |
| `BREAK_CACHE_COMMAND` | 缓存清除注入 |

</details>

#### 第二层：用户类型（`USER_TYPE`）

- **`ant`**（Anthropic 内部）— 解锁全部功能、20 分钟 GrowthBook 刷新、调试工具、200+ 处专属检查
- **`external`**（外部用户）— 裁剪版，6 小时 GrowthBook 刷新

#### 第三层：GrowthBook 远程 A/B 测试

| 开关 | 控制内容 |
|------|---------|
| `tengu_kairos` | KAIROS 助手模式开关 |
| `tengu_onyx_plover` | 自动做梦阈值（间隔/会话数） |
| `tengu_cobalt_frost` | 语音识别（Nova 3）开关 |
| `tengu_ultraplan_model` | Ultraplan 使用的模型 |
| `tengu_ant_model_override` | 内部用户模型覆盖 |
| `tengu_session_memory` | 会话记忆功能 |
| `tengu_max_version_config` | 自动更新 Kill Switch |
| `tengu_frond_boric` | 数据接收器 Kill Switch |
| `tengu_herring_clock` | 团队记忆路径 |
| `tengu_sm_config` | 会话记忆配置 |

---

## 隐藏环境变量速查

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
| `CLAUDE_INTERNAL_FC_OVERRIDES` | GrowthBook 覆盖（仅 ant） |

</details>

---

## 项目结构

```
src/                    # 核心源码（1,987 个 TS/TSX）
├── tools/              # 53 个工具（Bash/FileEdit/Agent/MCP...）
├── commands/           # 87 个斜杠命令
├── services/           # API / MCP / analytics / autoDream
├── components/         # 148 个终端 UI 组件（React + Ink）
├── hooks/              # 87 个自定义 Hooks
├── buddy/              # 宠物伴侣系统
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

---

## 输入框文件引用

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

---

## 斜杠命令清单

命令注册以 `src/commands.ts` 为准；`src/commands/` 的文件数量不等于当前构建中可输入的命令数量。下面按**常用**、**高级与集成**、**受限/实验/内部**三组列出，并保留实际命令名及别名。部分命令会受登录状态、套餐、平台、环境变量或编译开关限制。

### 一、用户常用

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
| `/cost` | 显示当前会话的成本与时长。 |
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

### 二、高级与集成

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
| `/mobile`、`/ios`、`/android` | 显示 Claude 移动端下载二维码。 |
| `/install-github-app` | 为仓库配置 Claude GitHub Actions。 |
| `/install-slack-app` | 安装 Claude Slack App。 |
| `/login`、`/logout` | 登录或登出 Anthropic 账户。 |
| `/usage` | 显示 Claude.ai 套餐用量限制；仅 Claude.ai OAuth 订阅者可见。通过自定义 `ANTHROPIC_BASE_URL` 的代理、Bedrock、Vertex、Foundry 或普通 API Key 使用时会被隐藏。 |
| `/upgrade` | 升级至 Max；受账户资格限制。 |
| `/output-style` | 已弃用；请改用 `/config` 调整输出样式。 |
| `/statusline` | 配置状态栏显示。 |
| `/terminal-setup` | 执行终端设置/安装引导。 |

### 三、受限、实验或内部命令

| 命令 | 用途与限制 |
|---|---|
| `/advisor` | 选择辅助顾问模型：它可在主模型之外协助回答或分析；仅账户具备该实验资格时显示。 |
| `/files` | 列出本次会话已加入上下文、可供模型参考的文件；仅内部构建可用。 |
| `/remote-control`、`/rc` | 让 Claude 网页端或移动端连接并操作当前本地终端；当前构建需启用远程控制功能。 |
| `/session`、`/remote` | 生成远程会话链接和二维码，用其他设备继续或查看当前会话；仅远程会话模式可用。 |
| `/desktop`、`/app` | 把当前会话转交到 Claude Desktop 应用继续处理；仅部分平台和订阅账户可用。 |
| `/chrome` | 连接、设置或管理 Claude in Chrome 浏览器扩展（Beta）；需满足登录和会话条件。 |
| `/extra-usage` | 在套餐额度耗尽后，设置是否允许按额外用量继续使用；仅符合资格的账户可用。 |
| `/privacy-settings` | 查看或修改数据使用、隐私相关偏好；仅消费者订阅账户可用。 |
| `/remote-env` | 为可传送到远程端的会话选择默认运行环境，例如远程开发环境。 |
| `/sandbox` | 启用或关闭命令执行沙箱，以限制工具可访问的系统资源。 |
| `/passes` | 向他人赠送或分享限时免费使用资格；仅活动符合条件的账户可见。 |
| `/ultrareview` | 将当前分支交给 Web 端进行更深入、耗时更长的缺陷审查；实验性功能。 |
| `/think-back`、`/thinkback-play` | 查看或播放 Claude Code 的年度使用回顾；仅在活动开启期间可用。 |
| `/web-setup` | 在 Claude 网页端连接 GitHub 并完成 Claude Code 的 Web 使用设置；仅部分 Claude.ai 账户和策略允许时可用。 |
| `/fork` | 将当前任务分叉为独立的子 Agent 会话，用于并行处理；未启用该功能时它只是 `/branch` 的别名。 |
| `/buddy` | 在终端中启用可互动的 AI 宠物功能；属于实验功能，默认构建通常不提供。 |
| `/proactive` | 让助手在空闲期间自主检查待办、继续合适的工作；需启用持久助手/主动模式实验。 |
| `/brief` | 切换为更精简的回答风格；需启用 KAIROS 助手实验且账户具备资格。 |
| `/assistant` | 开启可跨会话持续工作的持久助手模式；属于 KAIROS 实验功能。 |
| `/remote-control-server` | 在本机启动远程控制服务端，供其他 Claude 客户端连接；仅内部/实验构建可用。 |
| `/voice` | 用语音输入与 Claude 交互；需语音实验、订阅资格和服务端开关均已启用。 |
| `/peers` | 管理本地 Claude 进程之间的消息收件箱和协作通信；仅实验构建可用。 |
| `/workflows` | 管理可复用的工作流脚本：把一组预定义步骤保存为命令，以便重复执行开发流程；仅启用工作流实验时可用。 |
| `/torch` | Anthropic 内部代号功能；源码未提供面向外部用户的稳定用途说明，默认不可用。 |
| `/heapdump` | 将当前 JavaScript 内存快照写入桌面目录，供排查内存泄漏或异常内存占用，不用于日常开发。 |
| `/ultraplan` | 将复杂问题交给云端进行较长时间的独立研究和方案规划；当前外部构建已强制禁用。 |

内部构建（`USER_TYPE === 'ant'` 且非 Demo）还会注册：`/backfill-sessions`、`/break-cache`、`/bughunter`、`/commit`、`/commit-push-pr`、`/ctx_viz`、`/good-claude`、`/issue`、`/init-verifiers`、`/mock-limits`、`/bridge-kick`、`/version`、`/reset-limits`、`/onboarding`、`/share`、`/summary`、`/teleport`、`/ant-trace`、`/perf-issue`、`/env`、`/oauth-refresh`、`/debug-tool-call`、`/agents-platform`、`/autofix-pr`。其中部分还受各自功能开关约束，不应视为外部可用命令。

## REPL 模块说明

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
| 通知与提示 | `notifications`、`notifier`、`hooks/notifs/*`、`tips/*`、`IssueFlagBanner` | 展示终端/系统通知、设置和网络状态、限流、升级、插件、IDE 等提示。 |
| 会话生命周期 | `sessionStart`、`hooks`、`ExitFlow`、`gracefulShutdown`、`preventSleep`、`backgroundHousekeeping` | 执行会话开始/结束钩子，处理退出、后台清理和防止系统休眠。 |
| 远程与后台会话 | `useRemoteSession`、`useSSHSession`、`useDirectConnect`、`LocalMainSessionTask`、`useSessionBackgrounding` | 提供远程/SSH/直连会话能力，并支持将主会话转入后台。 |
| 配置、实验与遥测 | `config`、`analytics/*`、`diagnosticTracking`、`sessionTracing`、`activityManager` | 读写用户配置和动态实验配置，采集诊断/会话追踪并维护活动状态。 |
| 条件加载模块 | `useVoiceIntegration`、`useFrustrationDetection`、`coordinatorMode`、`proactive/*`、`WebBrowserPanel` | 通过 `feature(...)` 或内部构建条件按需 `require`，使未启用功能可被构建工具剔除。 |
| 其他界面能力 | `Spinner`、`TaskListV2`、`CompanionSprite`、`DevBar`、`TungstenLiveMonitor` | 显示加载状态、任务列表、助手形象、开发栏及工具实时监视器。 |




## 数据来源

- npm 包：[@anthropic-ai/claude-code](https://www.npmjs.com/package/@anthropic-ai/claude-code)
- 还原方式：提取 `cli.js.map` 中的 `sourcesContent`

## 声明

- 源码版权归 [Anthropic](https://www.anthropic.com) 所有
- 仅用于技术研究与学习，请勿用于商业用途
- 如有侵权，请联系删除
