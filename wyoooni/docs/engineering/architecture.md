# Wyoooni 架构规范

## 模块职责

```text
applications/wyoooni-application             独立发布的Spring Boot生产宿主
shared/wyoooni-enterprise-adapter             跨ERP、SCM、SRM复用的企业能力适配层
modules/supplier-quote/*                      供应商报价核心与宿主适配器
```

- `wyoooni-application` 必须拥有启动类，并且不依赖Forge即可启动。
- `wyoooni-enterprise-adapter` 是可插拔依赖，不得拥有启动类。
- 企业适配层不得包含供应商报价、订单、对账等单一业务逻辑。
- 业务能力放在独立Starter和业务Adapter；Forge只作为开发、演示宿主。
- 生产宿主不得依赖 `toolbox-starter` 或Forge专有Bean。

## 分层与依赖

```text
com.regentech_fashion.wyoooni.enterprise
├── domain          领域模型与最小业务端口
├── application     用例端口、请求上下文和应用异常
├── infrastructure  JPA、HTTP、Oracle等技术实现
└── config          ConfigurationProperties与Spring装配

config -> infrastructure -> application/domain
业务Adapter -> application/domain
```

- 业务Adapter不得依赖 `infrastructure` 实现类。
- Entity不得进入domain、application或Controller响应。
- 模型、端口、技术实现和自动配置不得平铺在同一根包。
- OAuth state、微信会话、账号绑定必须保持独立端口，禁止合并为万能IdentityStore。
- 新增Spring Bean前必须检索同一扫描范围的同名组件，并通过宿主启动测试验证。

## 数据架构

- H5自有业务数据统一使用Spring Data JPA。
- 每种职责使用 `Entity + JpaRepository + Jpa...Store`，Store实现domain端口。
- Entity不得穿透到domain、application或Controller响应。
- Hibernate保持 `open-in-view=false` 和 `ddl-auto=none`，表结构由受控Schema或迁移工具维护。
- OAuth state等一次性资源必须使用带状态与有效期条件的原子更新，并检查受影响行数。
- ERP Oracle是外部遗留系统只读边界，使用独立数据源，不加入本地H5 JPA持久化单元。
- 普通H5 CRUD不得使用 `JdbcTemplate`；遗留SQL和JPA无法合理表达的查询必须隔离在infrastructure。

## 连接池与资源生命周期

- 所有数据库DataSource必须由HikariCP管理生命周期、连接复用和超时，禁止直接暴露裸驱动DataSource。
- SQLite与Oracle使用独立连接池、独立池名和独立参数，禁止共享或复用同一个DataSource。
- SQLite采用小池并启用WAL：默认最大4、最小空闲1；增加连接数不能突破SQLite单写者限制。
- Oracle只读校验池默认最大3、最小空闲1，并配置连接、校验、空闲、keepalive和最大生命周期。
- 连接池时间属性统一使用Java `Duration` 和YAML单位（如 `10s`、`5m`），禁止裸毫秒魔法数字。
- Oracle keepalive必须短于max-lifetime，validation-timeout不得超过connection-timeout。
- 生产Oracle启用时采用fail-fast初始化；开发环境默认关闭Oracle连接。
- 每个池必须注册关闭方法，由Spring容器在宿主停止时释放。
- HTTP、线程池等非数据库资源使用各自客户端的原生资源管理，禁止强行套用数据库连接池模型。
- 连接池参数通过模块Properties和环境变量管理，禁止在业务Service中创建连接池。
