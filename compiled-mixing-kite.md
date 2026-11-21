# 移除官方后台统计与 GrowthBook 远程配置

## Context

用户确认移除后台向官方发送的使用统计，并进一步确认删除 GrowthBook 远程功能配置。用户自行配置的监控不动；手动反馈、正常模型请求和远程同步实现不在本次删除范围。GrowthBook 被大量业务代码依赖，必须明确删除远程服务后的本地取值规则，不能直接删除文件造成导入失效。

## 实施方案

### 1. 官方统计整链路删除

- 删除 `src/utils/telemetry/bigqueryExporter.ts` 与 `src/services/api/metricsOptOut.ts`。
- 在 `src/utils/telemetry/instrumentation.ts` 删除官方 exporter 导入、账户资格判断、五分钟上传 reader 及相关过时注释。
- 删除 `src/utils/config.ts` 中 `metricsStatusCache` 字段声明。
- 保留用户配置的 OTEL exporter、共享指标定义、计数调用、日志与追踪、退出刷新和本地 Perfetto。

### 2. GrowthBook 改为纯本地功能配置

- 将 `src/services/analytics/growthbook.ts` 中远程 SDK、客户端初始化、认证头、身份属性收集、远程求值、磁盘远程缓存和周期刷新彻底移除。
- 保留调用方需要的本地配置读取能力，优先使用已有的显式本地覆盖；没有覆盖时，返回各调用方已经提供的默认值。布尔门控没有默认参数时沿用原来的无配置结果 `false`，不一律开启功能。
- 保留本地覆盖修改通知能力；删除只用于启动、登录后刷新、等待远程初始化与定时刷新的接入，不留下无意义的空初始化函数。
- 不再读取 `cachedGrowthBookFeatures` 或历史 `cachedStatsigGates`。清理对应字段声明及确认无其他用途的专用辅助函数、SDK 直接依赖；不修改用户现有配置文件，不新增缓存迁移。
- 核查 `src/entrypoints/init.ts`、登录/退出登录接入、`src/main.tsx`、`src/components/Settings/Config.tsx` 和刷新订阅调用方，保留必要的本地覆盖刷新行为，修正说明文字。
- 核查 `src/utils/user.ts` 和 `src/constants/keys.ts` 的 GrowthBook 专用属性与客户端 key，只有确认无其他用途才删除。

### 3. 明确功能影响

不新增一份远程配置替代表，不擅自解除权限或安全限制。缺少显式本地覆盖时使用代码现有默认值，因此原先依赖官方返回 `true` 的实验功能、远程控制入口和可信设备资格入口可能不再开放；功能实现本身不删除。原来默认启用的功能继续按调用方默认值运行。安全限制门控沿用现有无远程配置行为，并在完成说明中单独列出。

## 验证

- 不进行构建验证，不提交、推送或合并。
- 增加可直接运行的独立测试脚本，常量放顶部，检查官方统计与 GrowthBook SDK/端点/初始化已不存在、旧缓存不再参与取值、本地覆盖及默认值规则符合预期。遵循现有可用测试运行方式，不新增依赖。
- 用源码引用搜索和差异检查确认没有悬空导入，且用户自配 OTEL 导出、反馈上传、业务联网未被误删。
- 总结删除通道、保留通道、功能默认值影响和测试运行方式。本次没有新增接口，无 curl 示例。
