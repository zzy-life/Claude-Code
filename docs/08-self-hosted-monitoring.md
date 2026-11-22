# 自建监控接收服务与数据外发说明

## 1. 先分清监控和历史分析

当前项目已删除官方使用指标上传、统计许可查询、GrowthBook 远程配置、隐私提示已读回传，以及问卷后的会话分享提示和上传通道。以下保留功能不是同一条链路：

| 通道 | 用途 | 目的地 |
|---|---|---|
| 用户自配 OpenTelemetry（OTEL） | 收集用量、耗时、错误、工具执行等监控数据 | 由 `OTEL_EXPORTER_OTLP_*` 配置决定 |
| `/insights` | 主动分析历史使用情况，生成个人使用报告与改进建议 | 分析请求走正常模型客户端；普通 Anthropic 接口模式遵循 `ANTHROPIC_BASE_URL` |

`ANTHROPIC_BASE_URL` 控制模型请求，不是监控地址；`OTEL_EXPORTER_OTLP_ENDPOINT` 控制监控导出，不会改变模型请求地址。

### 问卷分享已移除，手动问题反馈仍保留

普通评分问卷、技能改进问卷及评分后的会话分享链路均已移除，不再展示对应评分或上传邀请。手动 `/feedback` 仍可在确认后上传问题报告及相关会话信息；删除问卷不等于删除所有主动反馈功能。

### `/insights` 具体做什么、发给谁

读取历史会话，必要时先摘要，再让模型提取任务目标、完成程度、满意度、使用障碍等，综合生成 HTML 使用报告。分析默认使用项目配置逻辑得到的 Opus 模型，因此会消耗模型调用额度；代理需要支持对应模型。

- 普通 Anthropic 客户端模式：配置 `ANTHROPIC_BASE_URL` 后发给该地址；未配置则使用 SDK 默认官方地址。
- Bedrock、Vertex、Foundry 模式：走对应提供商客户端，不由普通 Anthropic Base URL 决定。
- 普通用户的最终报告保存在本地 `usage-data` 目录，不会因为生成报告而额外上传到官方报告存储。
- `USER_TYPE=ant` 的内部用户分支还会尝试用 `ff` 命令上传 HTML 到内部 S3。这与模型分析请求是两回事。
- 此命令不是后台遥测，但会把历史会话内容或摘要作为模型输入发送出去。使用第三方代理时，该代理也会接收到这些内容。

调用链：`src/commands/insights.ts` → `queryWithModel()`（`src/services/api/claude.ts`）→ `getAnthropicClient()`（`src/services/api/client.ts`）。普通模式 SDK 从环境读取 `ANTHROPIC_BASE_URL`。

## 2. 自建接收端需要哪些东西

推荐使用 OpenTelemetry Collector，不必自己实现接收协议。

```text
Windows 上的 Claude Code
    │ OTLP over HTTP（建议 http/protobuf）
    ▼
你部署的 OpenTelemetry Collector
    ├─ 指标 → 指标存储 / Grafana 等展示系统
    ├─ 事件日志 → 日志存储
    └─ 可选调用链 → 追踪存储
```

### 最小验证环境

- 一台运行 Docker 的机器（可以是 Windows Docker Desktop 的 Linux 容器，也可以是 Linux 服务器）。
- OpenTelemetry Collector 容器与配置文件。
- 客户端能访问接收端 HTTP 端口，常用 `4318`。
- 验证阶段直接查看 Collector 输出即可，不需要数据库或 Grafana。

### 长期运行还需要

- 按需要选择持久化后端，例如指标存储、日志存储、调用链存储；Collector 本身不是历史查询数据库。
- 查询和展示界面；Grafana 是展示组件，不是通用 OTLP 接收服务。
- HTTPS、访问认证、网络访问控制、磁盘容量和保留周期。
- Collector 自身错误监控和接收限流；规模扩大后再考虑队列、重试、持久化队列和高可用。

不要直接把无认证的 `4318` 接口开放到公网。监控里也可能包含账号信息、路径、错误文本，甚至提示词和工具参数。

## 3. 最小接收端：Collector

下面示例仅用于本机验证，不配置持久化和认证。创建一个目录，在里面新建 `otel-collector.yaml`：

```yaml
receivers:
  otlp:
    protocols:
      http:
        endpoint: 0.0.0.0:4318

processors:
  batch: {}

exporters:
  debug:
    verbosity: basic

service:
  pipelines:
    metrics:
      receivers: [otlp]
      processors: [batch]
      exporters: [debug]
    logs:
      receivers: [otlp]
      processors: [batch]
      exporters: [debug]
    traces:
      receivers: [otlp]
      processors: [batch]
      exporters: [debug]
```

PowerShell 中进入该目录后运行（示例固定版本便于复现，上线时应选择并验证受维护版本）：

```powershell
$CollectorImage = 'otel/opentelemetry-collector-contrib:0.123.0'
$ConfigFile = (Resolve-Path '.\otel-collector.yaml').Path

docker run --rm --name claude-otel `
  -p 127.0.0.1:4318:4318 `
  --mount "type=bind,source=$ConfigFile,target=/etc/otelcol-contrib/config.yaml,readonly" `
  $CollectorImage `
  --config=/etc/otelcol-contrib/config.yaml
```

- 这里将宿主机端口只绑定到回环地址，其他机器不能访问。
- `debug` 只在容器输出中展示收到的数据；`--rm` 容器退出后不会提供持久历史数据。
- 需要查看完整字段时可暂时将 `verbosity` 改成 `detailed`，但容器日志可能因此留下敏感内容。
- 远程部署需要自行配置反向代理、TLS 和认证，不能直接把此无认证示例改成公网监听投入生产。

## 4. Windows 客户端配置

### 4.1 推荐从指标开始

另开一个 PowerShell 窗口，在启动 Claude Code 前设置：

```powershell
$env:CLAUDE_CODE_ENABLE_TELEMETRY = '1'
$env:OTEL_METRICS_EXPORTER = 'otlp'
$env:OTEL_LOGS_EXPORTER = 'none'
$env:OTEL_TRACES_EXPORTER = 'none'
$env:OTEL_EXPORTER_OTLP_PROTOCOL = 'http/protobuf'
$env:OTEL_EXPORTER_OTLP_ENDPOINT = 'http://127.0.0.1:4318'
$env:OTEL_METRIC_EXPORT_INTERVAL = '10000'
$env:OTEL_LOG_USER_PROMPTS = '0'
$env:OTEL_LOG_TOOL_DETAILS = '0'

ccli
```

这些环境变量只影响当前 PowerShell 及其新启动的子进程。源码开发运行可将 `ccli` 换成 `bun run dev`。

HTTP 公共端点应填写根地址，不要在这里加 `/v1/metrics`；SDK 根据不同信号追加路径：

| 信号 | HTTP 路径 | 请求格式 |
|---|---|---|
| 指标 | `/v1/metrics` | OTLP metrics |
| 事件日志 | `/v1/logs` | OTLP logs |
| 调用链 | `/v1/traces` | OTLP traces |

当前代码也支持 `http/json` 和 `grpc`，但最小部署建议显式使用 `http/protobuf`。指标、日志、追踪的协议可分别覆盖为 `OTEL_EXPORTER_OTLP_METRICS_PROTOCOL`、`OTEL_EXPORTER_OTLP_LOGS_PROTOCOL`、`OTEL_EXPORTER_OTLP_TRACES_PROTOCOL`。使用信号专用 `OTEL_EXPORTER_OTLP_*_ENDPOINT` 时，按 SDK 规则填写完整信号路径，不要与公共根端点混淆。

### 4.2 加入事件日志

需要知道请求耗时、API 错误和工具执行情况时，再开启：

```powershell
$env:OTEL_LOGS_EXPORTER = 'otlp'
$env:OTEL_LOGS_EXPORT_INTERVAL = '5000'
```

重新启动客户端使配置生效。普通事件日志不需要开启详细调用链。

### 4.3 生产环境认证

在接收端前部署 HTTPS 网关，并让它校验请求头。客户端配置示例：

```powershell
$MonitoringEndpoint = 'https://YOUR_MONITORING_HOST'
$MonitoringToken = 'REPLACE_WITH_YOUR_MONITORING_TOKEN'
$env:OTEL_EXPORTER_OTLP_ENDPOINT = $MonitoringEndpoint
$env:OTEL_EXPORTER_OTLP_HEADERS = "Authorization=Bearer $MonitoringToken"
```

占位符必须替换。Token 是监控服务凭证，不应复用模型 API Key，也不要提交到仓库。

- HTTP 导出器支持静态请求头，以及配置项 `otelHeadersHelper` 返回的动态请求头；动态同名字段覆盖静态字段。
- 仅设置客户端 Header 不会自动给 Collector 加认证，接收侧必须独立配置校验。
- 当前封装为 HTTP 导出器配置了代理、证书和 Header helper。gRPC 走 SDK 自身配置，不要假设这些 HTTP 特性也全部适用。
- 自签名 CA、代理和 mTLS 需要与项目证书、代理配置一致；不要通过关闭证书验证解决问题。

### 4.4 高级追踪不是“填地址就有”

普通 OTEL traces 除了上述总开关和 `OTEL_TRACES_EXPORTER=otlp`，还依赖 `ENHANCED_TELEMETRY_BETA` 编译功能和增强追踪运行开关（如 `CLAUDE_CODE_ENHANCED_TELEMETRY_BETA=1`）。构建未包含该能力时，填变量也不会产生正常增强追踪。

另有独立 Beta 详细追踪路径，由 `ENABLE_BETA_TRACING_DETAILED` 和 `BETA_TRACING_ENDPOINT` 控制，外部用户还受运行模式条件限制。它会采用独立初始化流程，不能简单理解为在普通 OTEL 配置上再多打开一个信号。可能包含系统提示词、消息及工具内容，不建议作为初次部署方案。

**Beta 条件满足时，即使普通遥测总开关关闭、logs/traces exporter 设为 `none`，该独立路径仍可能发送。** 普通提示词和工具详情开关也不能视为 Beta 内容的统一脱敏保证。不使用时应取消 `ENABLE_BETA_TRACING_DETAILED` 和 `BETA_TRACING_ENDPOINT`。

## 5. 能收到哪些数据

### 指标

当前定义包括：

- `claude_code.session.count`：会话数。
- `claude_code.lines_of_code.count`：代码修改行数。
- `claude_code.pull_request.count`、`claude_code.commit.count`：相应操作计数。
- `claude_code.cost.usage`：客户端估算费用，不等同于最终账单。
- `claude_code.token.usage`：Token 用量。
- `claude_code.code_edit_tool.decision`：代码编辑工具决策计数（以源码实际定义为准）。
- `claude_code.active_time.total`：活跃时间。

指标默认导出间隔为 60 秒。项目默认使用 delta temporality，后端需正确处理增量，不能直接当累计总量。

### 公共身份属性：仅开启指标也可能发送

指标和事件共用身份属性。即使只按第 4.1 节开启指标，也可能携带用户 ID、会话 ID，以及 OAuth 认证下的邮箱、组织 ID、账户 UUID，不能认为“只有数字就没有身份信息”。

### 事件日志与隐私

事件可包含 API 请求、耗时、用量、错误、工具执行及权限选择等。根据事件和认证状态，还可能包含：

- 用户 ID、会话 ID、组织 ID、邮箱和账户 UUID。
- 模型名、工具名、错误文本等。
- 配置 `CLAUDE_CODE_WORKSPACE_HOST_PATHS` 时的工作区路径。

`OTEL_LOG_USER_PROMPTS=1` 可记录提示词正文；`OTEL_LOG_TOOL_DETAILS=1` 可增加具体工具信息和序列化工具参数。即使两者关闭，错误文本或其他字段仍可能包含业务信息，不能当成完整脱敏。

以下变量可控制部分标识字段，但不能移除全部身份数据：

```powershell
$env:OTEL_METRICS_INCLUDE_SESSION_ID = 'false'
$env:OTEL_METRICS_INCLUDE_ACCOUNT_UUID = 'false'
$env:OTEL_METRICS_INCLUDE_VERSION = 'false'
```

例如用户 ID、邮箱和组织 ID 不由这三个开关统一关闭；关闭版本属性也不会移除 resource 中的 `service.version`。要求严格匿名时，应在 Collector 增加字段过滤，再转发到存储；不要把完整用户 ID、会话 ID、路径全部作为长期指标标签，以免产生高基数问题。

## 6. 验证方法与排障

### 先测接收端，不发送真实会话

PowerShell（兼容 Windows PowerShell 5.1，避免原生 curl 参数中的 JSON 引号兼容问题）：

```powershell
$ProbeUri = 'http://127.0.0.1:4318/v1/metrics'
$ProbeBody = '{"resourceMetrics":[]}'
Invoke-WebRequest -UseBasicParsing -Method Post -Uri $ProbeUri `
  -ContentType 'application/json' -Body $ProbeBody
```

通常返回 200 和空响应对象。这只是检查 HTTP OTLP 路由可达，不证明客户端已发出有效指标，也不一定产生 debug 数据输出。不要向线上接收端发送真实业务内容进行随意试验。

### 再测客户端

1. 启动 Collector。
2. 在配置好环境变量的新窗口启动客户端。
3. 发起一次普通对话；需要有效的模型接口、认证和额度。
4. 等待设置的导出周期，观察 Collector 是否出现 metrics / logs 记录。
5. 正常退出客户端；强制杀进程可能丢失尚未发送的数据。

没有数据时依次检查：

- 环境变量是否设置在实际启动客户端的进程中；已运行进程不会自动继承新值。
- 是否同时开启总开关、信号 exporter 和协议；只配置地址不会自动导出。
- HTTP 端口是否为 4318，是否误连 gRPC 端口 4317。
- 容器内的 `localhost` 不等于宿主机；示例假设客户端直接在 Windows 主机上运行。
- 代理、`NO_PROXY`、认证头、CA 和防火墙是否正确。
- 只启用了 traces 但当前构建并不支持增强追踪。
- 是否只等待了几秒，而指标仍在默认 60 秒周期内。

## 7. 如要自己开发接收服务

接收端必须实现真正的 OTLP，而不是任意 JSON webhook：

- 支持相应 POST 路径及 `ExportMetricsServiceRequest`、`ExportLogsServiceRequest`、`ExportTraceServiceRequest` 数据结构。
- 按客户端协议解码 Protobuf 或 OTLP JSON；OTLP JSON 并非普通扁平事件 JSON。
- 返回符合 OTLP 的响应；限制请求体大小、并发和接收速率，正确处理压缩与失败响应。
- 做 TLS、认证、租户隔离、字段过滤、保留期限和权限审计。
- 正确处理指标增量/累计语义和重复请求，不要把 Token、费用重复累加。

通常更稳妥的办法是：让 Collector 接收 OTLP 并标准化处理，再通过合适 exporter 发给自己的存储或业务服务。

## 8. 实施范围与验证状态

本文是部署说明，没有自动安装 Docker、启动服务、修改用户监控设置或上传数据。Collector 示例尚未在当前环境实际部署验证，上线前需验证镜像、配置和后端兼容性。

源码入口：

- `src/utils/telemetry/instrumentation.ts`：协议、导出器、间隔、Header、代理和生命周期。
- `src/utils/telemetry/events.ts`：事件发送与属性。
- `src/utils/telemetryAttributes.ts`：身份字段。
- `src/bootstrap/state.ts`：指标定义。
- `src/services/analytics/metadata.ts`：工具详情开关。
- `src/utils/telemetry/sessionTracing.ts`：增强追踪条件。
