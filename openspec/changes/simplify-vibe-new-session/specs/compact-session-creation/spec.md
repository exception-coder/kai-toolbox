## ADDED Requirements

### Requirement: Three core choices

新建会话 MUST 默认只要求选择工作区、可选项目和编程引擎，提供最近有效配置快捷创建，并自动命名。

#### Scenario: Create without a project
- **WHEN** 用户选择工作区且不选择项目
- **THEN** 创建 MUST 使用明确显示的工作区根目录，不沿用其他工作区项目

#### Scenario: Recover invalid selections
- **WHEN** 项目隐藏、删除、不属于当前工作区，或最近配置的引擎/服务商不再可用
- **THEN** 系统 MUST 阻止失效配置创建并提供选择或设置入口，不静默替换执行目录或服务商

#### Scenario: Reuse recent configuration
- **WHEN** 用户点击已按当前目录、引擎及服务商重新核验的最近配置
- **THEN** 系统 MUST 用该配置发起一次创建并保留正常创建协议，重复点击不得在当前调用期间重复派发

### Requirement: Progressive workspace settings

系统 MUST 将路径登记、常用目录、聚合和运行内部配置放入按需设置，复用现有公共配置和权限。

#### Scenario: Register a workspace
- **WHEN** 用户在新建工作区抽屉保存真实目录
- **THEN** 系统 MUST 登记至原目录清单，刷新后选中工作区；失败保留路径且说明是否已保存

#### Scenario: Mobile and keyboard recovery
- **WHEN** 手机或键盘用户选择项目、搜索工作区、打开并关闭设置
- **THEN** 核心操作 MUST 可达，创建按钮固定在面板底部，搜索不得改写原选择，关闭设置恢复适用草稿与焦点
