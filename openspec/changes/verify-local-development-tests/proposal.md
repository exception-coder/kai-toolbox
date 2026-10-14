## Why
自动监督的开发完成要求本地测试证据，现有运行验证只有 API/SQL，需要运行中的外部服务，无法接入项目已有 Maven 回归。

## What Changes
- 增加 maven-test 场景，固定执行项目指定模块与测试的 Maven test 生命周期。
- 必须检查本轮新报告及真实执行数量，不接受跳过、旧报告或零测试作为通过。
- 项目根由入口传入，不由配置覆盖；开发门禁不启动生产环境或 Docker。

## Capabilities
### New Capabilities
- `local-development-verification`: 本地测试纳入统一质量门禁。
### Modified Capabilities
None.

## Impact
Forge runtime verifier、配置装载和能力文档；Yoooni One 独立接入本地配置。监督状态与生产人工任务语义不变。
