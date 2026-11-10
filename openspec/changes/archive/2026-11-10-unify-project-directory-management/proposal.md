## Why

项目库已提供目录管理，但配置中心仍重复展示 Claude 工作目录、项目管理和业务系统源码；扫描规则散落在旧入口，部分查询绕过统一项目解析服务，容易出现设置与实际使用范围不一致。

## What Changes

- 将三个目录配置块的目录、扫描规则和托管 Git 超时设置集中到项目库，移除配置中心重复编辑入口，兼容旧深链跳转。
- 保留既有动态配置存储和键，直接呈现原有效值，不复制配置、不搬移源码、不扩大文件操作授权范围。
- Graphify 与跨项目拓扑查询通过已有 LocalProjectResolver 解析项目，与 AI 工作区共享发现结果。
- 提供可恢复的加载、保存错误和输入校验，补充回归与实际运行验证。

## Capabilities

### New Capabilities

- `project-directory-management`: 项目目录与运行选项的集中管理及旧入口兼容。

### Modified Capabilities

无。

## Impact

前端 project-workspace、config-center 与旧目录提示；PRD 查询的项目路径解析。复用动态配置 API 和 LocalProjectResolver，不新增数据库表或模块依赖。证据来自现有源码、Graphify 定位和运行日志。目录类别仍保留其原用途；不合并授权边界、不修改已登记系统身份。本轮无待定产品决策。
