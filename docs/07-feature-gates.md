# 编译开关 + 本地默认值门控

> 源码位置：`src/commands.ts`、`src/main.tsx`、`src/services/analytics/growthbook.ts`

原始源码使用编译开关、用户身份、远程配置三层门控。本仓库已移除 GrowthBook 远程求值和本地覆盖；查询接口现在固定返回调用方默认值。下文区分当前机制与历史名称，不将源码保留等同于功能已启用。

---

## 三层门控架构

```
┌─────────────────────────────────────────────────┐
│  第一层：编译时开关 feature()                      │
│  代码包含 or 移除（Dead Code Elimination）          │
├─────────────────────────────────────────────────┤
│  第二层：运行时 USER_TYPE                          │
│  'ant'（内部）vs 'external'（外部）                 │
├─────────────────────────────────────────────────┤
│  第三层：本地默认值查询                             │
│  tengu_ 接口返回调用方默认值，无远程求值              │
└─────────────────────────────────────────────────┘
```

---

## 第一层：编译时开关

通过 `feature()` 函数（来自 `bun:bundle`）实现。构建时决定代码包含或排除，未包含的代码被 DCE（Dead Code Elimination）完全移除。

### 核心功能开关

| 开关 | 说明 | 状态 |
|------|------|------|
| `KAIROS` | 持久助手模式 | 外部版未启用 |
| `KAIROS_BRIEF` | 简报模式 | 外部版未启用 |
| `KAIROS_CHANNELS` | 通道通知 | 外部版未启用 |
| `KAIROS_GITHUB_WEBHOOKS` | GitHub Webhook | 外部版未启用 |
| `COORDINATOR_MODE` | 多 Agent 编排 | 外部版未启用 |
| `BRIDGE_MODE` | 远程控制桥接 | 外部版未启用 |
| `VOICE_MODE` | 语音交互 | 外部版未启用 |
| `PROACTIVE` | 主动自主模式 | 外部版未启用 |
| `FORK_SUBAGENT` | 子代理分叉 | 外部版未启用 |
| `DAEMON` | 守护进程模式 | 外部版未启用 |

### 基础设施开关

| 开关 | 说明 |
|------|------|
| `UDS_INBOX` | Unix Domain Socket 收件箱 |
| `WORKFLOW_SCRIPTS` | 工作流脚本 |
| `MONITOR_TOOL` | 监控工具 |
| `HISTORY_SNIP` | 历史截断 |
| `BG_SESSIONS` | 后台会话管理 |
| `HARD_FAIL` | 硬失败模式 |

### 优化与实验开关

| 开关 | 说明 |
|------|------|
| `CACHED_MICROCOMPACT` | 缓存微压缩 |
| `CONTEXT_COLLAPSE` | 上下文折叠 |
| `REACTIVE_COMPACT` | 响应式压缩 |
| `QUICK_SEARCH` | 快速搜索 |
| `TOKEN_BUDGET` | Token 预算跟踪 |
| `STREAMLINED_OUTPUT` | 精简输出 |
| `CONNECTOR_TEXT` | 连接器文本块 |
| `TERMINAL_PANEL` | 终端面板 |
| `MESSAGE_ACTIONS` | 消息操作 |

### 安全与合规开关

| 开关 | 说明 |
|------|------|
| `ANTI_DISTILLATION_CC` | 反蒸馏保护 |
| `BASH_CLASSIFIER` | Bash 命令分类器 |
| `NATIVE_CLIENT_ATTESTATION` | 原生客户端证明 |
| `TRANSCRIPT_CLASSIFIER` | 转录分类器（自动模式） |
| `UNATTENDED_RETRY` | 无人值守重试 |

### 数据与遥测开关

| 开关 | 说明 |
|------|------|
| `EXTRACT_MEMORIES` | 自动提取记忆 |
| `SLOW_OPERATION_LOGGING` | 慢操作日志 |
| `PROMPT_CACHE_BREAK_DETECTION` | 缓存中断检测 |
| `COMMIT_ATTRIBUTION` | 提交归属标注 |

### 其他开关

| 开关 | 说明 |
|------|------|
| `LODESTONE` | Lodestone 功能 |
| `MCP_SKILLS` | MCP 技能系统 |
| `EXPERIMENTAL_SKILL_SEARCH` | 实验性技能搜索 |
| `TEMPLATES` | 模板/工作分类器 |
| `TEAMMEM` | 团队记忆同步 |
| `FILE_PERSISTENCE` | 文件持久化 |
| `AGENT_TRIGGERS` | Cron 触发器系统 |
| `IS_LIBC_GLIBC` | glibc 检测 |
| `IS_LIBC_MUSL` | musl 检测 |

---

## 第二层：用户类型（USER_TYPE）

`process.env.USER_TYPE` 在构建时被硬编码。外部版固定为 `"external"`。

| 值 | 身份 | 检查点数量 |
|----|------|-----------|
| `'ant'` | Anthropic 内部员工 | 200+ 处 |
| `'external'` | 外部用户 | — |

源码中到处可见 `"external" === 'ant'` 的比较，这永远为 `false`。

### ant 专属能力

| 类别 | 能力 |
|------|------|
| 调试 | 部分 API 错误详情、prompt dump 等身份分支仍保留，实际以当前调用链为准。 |
| 命令 | `INTERNAL_ONLY_COMMANDS` 仅保留 `/init-verifiers`、条件启用的 `/force-snip`、`/subscribe-pr` 和当前不可用的 `/agents-platform`。 |
| 功能限制 | 内部身份不会恢复已删除的功能，也不会覆盖默认关闭的 gate。 |

Gates 标签页、GrowthBook 覆盖／刷新和官方 Datadog 上传已删除，不再是 ant 专属能力。

---

## 第三层：本地默认值查询

`src/services/analytics/growthbook.ts` 保留查询接口，但直接返回调用方默认值：

- 不初始化 GrowthBook SDK，不发起远程求值请求。
- 不维护远程配置磁盘缓存、用户属性或定时刷新。
- 不提供本地覆盖写入、订阅或 Gates UI。
- 默认值为 `false` 的分支保持关闭；仍须保留具有有效默认行为的查询，不能按 `tengu_` 名称批量删除。

### 查询名称与历史用途（`tengu_` 前缀）

下表仅说明历史名称及用途，不表示各名称当前仍有消费者或远程服务。官方埋点、模型覆盖等专用链路已移除。

| 开关 | 控制内容 |
|------|---------|
| `tengu_kairos` | KAIROS 助手模式总开关 |
| `tengu_onyx_plover` | AutoDream 阈值（整合间隔/会话数） |
| `tengu_cobalt_frost` | 语音识别（Nova 3）开关 |
| `tengu_ant_model_override` | 内部用户模型覆盖 |
| `tengu_session_memory` | 会话记忆功能 |
| `tengu_sm_config` | 会话记忆配置 |
| `tengu_max_version_config` | 自动更新 Kill Switch |
| `tengu_frond_boric` | 数据接收器 Kill Switch |
| `tengu_herring_clock` | 团队记忆路径 |
| `tengu_log_datadog_events` | Datadog 事件日志 |
| `tengu_1p_event_batch_config` | 一方事件批处理配置 |
| `tengu_event_sampling_config` | 事件采样配置 |
| `tengu_ccr_bridge` | Bridge 远程控制总开关 |
| `tengu_bridge_repl_v2` | Bridge v2 传输协议 |
| `tengu_ccr_mirror` | CCR Mirror 只写模式 |
| `tengu_scratch` | Coordinator Scratchpad |
| `tengu_kairos_cron_config` | Cron Jitter 配置 |
| `tengu_kairos_cron_durable` | 持久 Cron 任务开关 |

### 已删除的覆盖机制

`CLAUDE_INTERNAL_FC_OVERRIDES`、`growthBookOverrides` 和 `CLAUDE_CODE_GB_BASE_URL` 不再被功能查询读取；`/config` 的 Gates 标签页也已删除。保留在旧 JSON 中的字段不代表覆盖仍有效，不自动迁移用户配置。

会话记忆和后台记忆提取受默认 `false` 门控时不会执行；普通记忆文件、手动编辑记忆及正常压缩是不同能力。用户显式配置的 OTEL、托管设置和正常设置监听没有随官方远程配置一并删除。

---

## 总结

当前功能边界：

```
外部用户能看到的
═══════════════════════════════
  基础 CLI 功能、公开命令

被 feature() 裁剪掉的
═══════════════════════════════
  KAIROS、
  BRIDGE、COORDINATOR、VOICE...

被 USER_TYPE 锁住的
═══════════════════════════════
  剩余内部命令、部分调试分支

由调用方默认值决定的
═══════════════════════════════
  保留的 tengu_ 查询，
  无远程刷新或本地覆盖
```

修改 `USER_TYPE` 只能影响仍存在的身份分支，不能恢复本仓库已删除的实现、远程配置或空壳原生依赖。
