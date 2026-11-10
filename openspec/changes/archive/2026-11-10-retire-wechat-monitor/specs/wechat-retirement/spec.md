## ADDED Requirements

### Requirement: 微信桌面监控退出运行装配
Forge SHALL 不再注册微信监控菜单、后端模块或 Python 辅助服务，旧启用配置不得重新启用已移除服务，并保留历史数据。

#### Scenario: 加载新版本
- **WHEN** 用户明确授权加载新版本
- **THEN** 菜单和宿主装配不包含微信桌面监控，服务目录不包含微信进程
- **AND** 供应商报价的微信业务保持不变

### Requirement: 已运行的旧微信进程可单独退役
Forge SHALL 通过统一入口精确移除本仓库私有 PM2 中已退役的微信进程，不重启其余服务。

#### Scenario: 重复执行退役
- **WHEN** 重复执行 `node forge.mjs retire wechat`
- **THEN** 仅第一次移除存在的微信进程，其余进程及历史数据保持不变

#### Scenario: 请求退役仍受支持的服务
- **WHEN** 请求退役后端等仍受支持的服务
- **THEN** 命令拒绝请求，不删除任何进程
