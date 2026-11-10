## Why

ERP、ERP 小程序、SRM、SCM、Forge 的开发入口分散，新增模块还会继续增加导航。用户要求集中到一个项目开发模块，以页签管理各工作台。

## What Changes

- 项目开发提供五个系统页签，复用已有服务、配置和目录身份。
- 新增模块作为页内操作，生成的新工作台注册到同一入口。
- 保留旧链接和原有细粒度权限，切换页签保留已填写内容。

## Capabilities

### New Capabilities

- `project-development-workspace`: 集中的开发工作台、权限与扩展契约。

### Modified Capabilities

无。

## Impact

前端六个 feature 的入口、工作台组合与脚手架提示。后端服务、配置存储和服务身份不变；数据库控制台仍为独立通用工具。
