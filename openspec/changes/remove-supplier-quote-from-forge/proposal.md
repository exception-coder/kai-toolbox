## Why

用户要求移除 Forge 中的供应商报价配置与供应商报价 H5 模块。旧变更 hide-supplier-quote-default-menu 只默认隐藏入口，不能满足移除要求。

## What Changes

- **BREAKING** 移除 Forge 的报价 H5 manifest、宿主入口和报价 Starter 依赖，已保存菜单偏好不能恢复该入口。
- 移除业务账号校验、微信公众号静默授权配置目录和宿主报价配置导入、专用匿名路径。
- 修正缺失资源异常的 HTTP 映射，旧接口返回 404 而不是被通用兜底转为 500。
- 保留 wyoooni-application 使用的共享 Starter、独立 H5 源码和构建命令；不删除历史数据库数据。

## Capabilities

### New Capabilities

- `forge-supplier-quote-retirement`: Forge 不再暴露供应商报价菜单、路由、配置或业务接口。

### Modified Capabilities

无。旧默认隐藏 change 保留为历史记录，本次移除要求取代其报价模块恢复入口的目标。

## Impact

frontend/src/features/supplier-quote-h5 的 Forge 接线、toolbox-starter 的依赖/配置/专用测试。Graphify 定位后以 bbcb7b50 工作区源码核对；wyoooni-application/pom.xml 证明独立构建仍依赖 H5。没有数据库变更或未决决策。
