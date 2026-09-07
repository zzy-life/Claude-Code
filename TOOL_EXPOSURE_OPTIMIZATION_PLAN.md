# 工具暴露策略优化方案

## 背景

当前工具暴露主要分为直接加载和 `ToolSearch` 延迟加载两类。延迟工具在完整 Schema 加载前通常只向模型公布工具名，模型无法据此稳定判断工具用途、关键前置条件和行为边界。生命周期型工具也主要依靠工具描述约束，而不是根据当前会话状态控制可见性。

本方案分两个阶段实施：第一阶段改善延迟工具的可发现性，并确保 Team 授权规则始终可见；第二阶段再引入状态驱动的动态暴露，避免一次性改动工具池、缓存和多个生命周期。

## 目标

- 模型在加载完整 Schema 前即可理解延迟工具的基本用途和关键限制。
- Team 授权边界不依赖 `TeamCreate` 是否已经通过 `ToolSearch` 加载。
- 在第二阶段让工具随 Team、Plan、Worktree、Task 和后台任务状态出现或消失。
- 保持工具 Schema 的 Session 级缓存稳定，动态状态通过过滤或附件传递。

## 非目标

- 不改变工具权限判断和调用结果。
- 第一阶段不修改现有 `shouldDefer` 取值。
- 第一阶段不改变 `ToolSearch` 的开关、阈值和 `tool_reference` 协议。
- 不在第一阶段引入新的 Team、Task 或 Worktree 状态机。

---

## 第一阶段：轻量可发现信息与基础授权边界

### 1. 延迟工具公告增加轻量说明

在 `Tool` 接口增加可选的 `deferredSummary`：

- 内容为稳定、简短的一行说明。
- 描述工具用途，并在必要时包含最关键的调用前置条件。
- 不包含当前成员数、任务数、连接状态等动态信息，避免缓存和历史附件过期。

延迟工具公告按以下优先级生成：

1. `deferredSummary`
2. `searchHint`
3. 仅工具名

输出格式：

```text
ToolName — lightweight purpose or boundary
```

内置工具已有较完整的 `searchHint`，可作为一般用途说明；对存在重要行为边界的工具单独设置 `deferredSummary`，第一批包括：

- `TeamCreate`：必须先获得用户授权，普通并行工作优先使用独立 `Agent`。
- `TeamDelete`：必须先移除全部非 lead 成员。
- `EnterWorktree`：只有用户明确要求 worktree 时才能调用。
- `ExitWorktree`：只退出本会话通过 `EnterWorktree` 创建的 worktree。

MCP 工具若通过 `_meta['anthropic/searchHint']` 提供提示，也使用相同格式；未提供时保持只显示名称。

### 2. Team 授权边界保持始终可见

`Agent` 是主会话和 Coordinator 的直接加载工具，其基础提示必须包含：

- Team 是需要用户授权的持久协作机制。
- 用户未明确要求时，只能在任何实质执行前通过 `AskUserQuestion` 提议一次。
- 编辑文件、运行实现/测试命令、创建并启动任务或启动 Agent 后，不得主动提议 Team。
- 仅任务较大、复杂或可并行，不足以创建 Team；独立工作默认使用一次性 `Agent`。

当前 `src/tools/AgentTool/prompt.ts` 已包含上述规则，第一阶段以静态复核为主，不重复添加同义文本。`TeamCreate.prompt()` 继续保留完整授权与顺序屏障说明。

### 3. 第一阶段涉及文件

- `src/Tool.ts`
- `src/tools/ToolSearchTool/prompt.ts`
- `src/tools/TeamCreateTool/TeamCreateTool.ts`
- `src/tools/TeamDeleteTool/TeamDeleteTool.ts`
- `src/tools/EnterWorktreeTool/EnterWorktreeTool.ts`
- `src/tools/ExitWorktreeTool/ExitWorktreeTool.ts`
- `src/tools/AgentTool/prompt.ts`（复核；仅在规则缺失时修改）

### 4. 第一阶段兼容性

- `addedNames` 继续只保存名称，用于 delta 去重和移除判断。
- 仅 `addedLines` 的展示文本变化，不改变附件结构。
- `ToolSearch` 的精确名称查询和关键词搜索不受影响。
- 没有 `deferredSummary` 和 `searchHint` 的工具保持旧格式。
- 不改变工具是否进入候选池、是否延迟或是否允许执行。

### 5. 第一阶段验收标准

- deferred-tools delta 和旧版 `<available-deferred-tools>` 两条路径使用同一格式化函数。
- 普通延迟工具至少显示 `名称 + searchHint`。
- 四个生命周期敏感工具显示明确的关键边界。
- `Agent` 的直接加载提示中始终存在 Team 授权边界。
- 不修改 API 工具 Schema、权限规则和 `shouldDefer`。

---

## 第二阶段：状态驱动的四级暴露策略

### 暴露级别

1. **核心常驻**：高频执行或首轮决策所需，完整 Schema 直接发送。
2. **状态常驻**：仅在对应生命周期内完整发送。
3. **轻量可发现**：仅公告名称、用途和前置条件，需要时通过 `ToolSearch` 加载。
4. **完全隐藏**：当前状态下一定无法调用，不向模型公告。

### 建议分类

| 级别 | 初始建议工具 |
|---|---|
| 核心常驻 | `Read`、`Edit`、`Write`、`Bash`、`Agent`、`Skill`、`AskUserQuestion`、`ToolSearch` |
| 状态常驻 | Team 活跃时的 `SendMessage` 和核心 Task 工具、Plan 模式的 `ExitPlanMode`、Worktree 会话中的 `ExitWorktree`、存在后台任务时的 `TaskStop` |
| 轻量可发现 | `TeamCreate`、`EnterWorktree`、`WebFetch`、`WebSearch`、`NotebookEdit`、`LSP`、Cron 和大多数条件工具 |
| 完全隐藏 | 无 Team 时的 `TeamDelete`、无 Worktree 时的 `ExitWorktree`、无后台任务时的 `TaskStop`、未连接语言服务器时的 `LSP`、Provider 不支持时的 `WebSearch` |

### 状态转换

#### Team

- 无 Team：轻量公布 `TeamCreate`；隐藏 `TeamDelete`。
- 用户已明确授权：下一请求预加载 `TeamCreate` 完整 Schema。
- Team 已创建：隐藏 `TeamCreate`；直接加载 `SendMessage` 和核心 Task 工具；轻量公布 `TeamDelete`。
- 全部非 lead 成员退出：预加载 `TeamDelete`。

#### Plan

- 普通模式：只公布或加载 `EnterPlanMode`。
- Plan 模式：隐藏 `EnterPlanMode`，直接加载 `ExitPlanMode`。
- 远程 channel：沿用现有逻辑隐藏两者。

#### Worktree

- 默认：轻量公布 `EnterWorktree`，隐藏 `ExitWorktree`。
- 用户明确提出 worktree：预加载 `EnterWorktree`。
- 已进入本会话 worktree：隐藏 `EnterWorktree`，直接加载 `ExitWorktree`。

#### Task

- 无任务且无 Team：仅公布或加载 `TaskCreate`。
- 已有任务：加载 `TaskList`、`TaskUpdate`；`TaskGet` 保持按需。
- Team 创建后：直接加载 `TaskCreate`、`TaskUpdate`、`TaskList`。

#### 后台任务

- 无后台任务：隐藏 `TaskStop`。
- 存在运行中后台任务：直接加载 `TaskStop`。
- `TaskOutput` 仅为恢复旧会话或没有输出文件的兼容路径保留。

### 动态信息承载方式

稳定规则继续放在工具 `prompt()`；动态信息通过过滤结果或新的 availability delta 附件传递，例如：

```text
TeamCreate: unavailable — already leading team "audit"
TeamDelete: blocked — 2 non-lead members remain
ExitWorktree: available — active worktree "feature-x"
TaskStop: available — 1 background task is running
```

不要把动态状态拼进 `tool.prompt()`，因为 `toolToAPISchema()` 会缓存基础 Schema，容易产生过期描述或破坏 Prompt Cache。

### 第二阶段建议实施顺序

1. 定义统一的工具可见性级别和请求级过滤接口。
2. 先接入 Plan、Worktree 等单一状态生命周期。
3. 接入后台任务和 Task 生命周期。
4. 最后接入 Team 状态，因为它涉及授权、成员、邮箱和共享任务表。
5. 为状态转换、恢复会话、Coordinator、同步/后台 Agent 分别补充测试。

### 第二阶段主要风险

- 历史会话恢复时状态和工具可见性不一致。
- 子 Agent、Coordinator 与主 REPL 使用不同过滤链导致行为漂移。
- 动态工具数组改变 Prompt Cache 命中率。
- 工具在同一轮消息处理期间消失，造成已有 `tool_use` 无法匹配。
- Team/Worktree 清理失败后错误地隐藏恢复工具。

### 第二阶段验收标准

- 每种生命周期均有明确、可测试的状态转换表。
- 主 REPL、Headless、Coordinator 和 Agent worker 使用同一可见性决策函数。
- 恢复会话后能重建 Team、Plan、Worktree、Task 和后台任务所需工具。
- 已产生的 `tool_use` 在结果返回前不会因状态变化失去对应工具定义。
- 对比优化前后的工具 Schema Token、无效工具调用率和额外 `ToolSearch` 往返次数。
