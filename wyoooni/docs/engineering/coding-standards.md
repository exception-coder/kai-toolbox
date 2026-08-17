# Wyoooni Java编码规范

## 基础约定

- 使用Java 21和Spring Boot 3.4项目约定。
- Maven `groupId` 与Java包根使用合法标识符 `com.regentech_fashion`。
- 类和方法按单一职责拆分，禁止一个类承载多个独立数据职责。
- domain值对象优先使用不可变Java `record`。
- 接口表示业务端口，实现类名称必须体现技术方式，例如 `JpaAccountBindingStore`。

## Lombok

- `@ConfigurationProperties` 使用 `@Getter`、`@Setter`，不得手写重复访问器。
- 使用Lombok的Maven模块必须直接声明依赖并设置 `optional=true`。
- 含密码、AppSecret、token、数据库连接信息的类型禁止使用 `@Data`。
- 不得为了使用Lombok把不可变domain模型改成可变Bean。

## MapStruct

- MapStruct只处理Entity、Domain、DTO或外部响应之间的结构映射。
- MapStruct不得用于Spring `ConfigurationProperties` 绑定。
- 单处、字段少且带业务语义的转换可使用显式工厂方法。
- 相同映射出现两处以上，或者字段数量持续增长时，必须抽取MapStruct Mapper。
- Mapper属于调用方适配层，domain不得依赖Mapper框架。

## 注释与异常

- 公共类、端口和非直观业务规则必须有职责Javadoc。
- 注释解释业务约束和原因，不复述代码语法。
- application层定义业务可处理的异常契约；业务模块不得捕获infrastructure私有异常。

## 配置与安全

- Properties按配置域拆分，禁止万能配置类。
- 默认值必须安全且不包含真实凭据。
- AppSecret、service token、Oracle密码不得写入源码、YAML默认值、测试、日志、README或Git历史。
- 敏感值只通过环境变量或受控配置中心注入。
- 密码仅用于即时校验，不得持久化到H5数据库。
- 私有运行配置不得提交Git；示例配置只保留变量名、用途和安全空值。

## Spring Boot YAML

配置必须按入口、公共模块和环境差异组织：

```text
src/main/resources/
├── application.yml
├── application-dev.yml
├── application-prod.yml
└── config/
    ├── common/
    │   ├── wyoooni-core.yml
    │   ├── persistence.yml
    │   ├── enterprise-integration.yml
    │   └── supplier-quote.yml
    ├── dev/environment.yml
    └── prod/environment.yml
```

- `application.yml` 只声明应用名、默认Profile和公共配置导入，不承载业务参数。
- `application-{profile}.yml` 只导入对应环境文件，不复制公共模块配置。
- `config/common` 按稳定业务或基础设施边界拆分；禁止按单个Properties类机械拆文件。
- `config/{profile}/environment.yml` 只保存该环境的端口、地址、模式和环境变量映射。
- 同一配置键只能有一个公共定义位置；环境文件只覆盖确实随环境变化的值。
- 开发环境允许安全的本地默认值；生产环境的凭据和外部服务地址不得提供可误用的默认值。
- `prod` 的必填环境变量缺失时应启动失败，禁止静默降级到mock或开发地址。
- 环境变量以所属系统和资源命名，例如 `WYOOONI_ACCOUNT_ORACLE_*`；禁止沿用某个业务模块的前缀描述企业共享资源。
- 时间配置使用可读单位 `ms`、`s`、`m` 并绑定为 `Duration`，禁止用字段名后缀和裸整数隐含单位。
- 新增配置文件必须通过 `spring.config.import` 显式接入，并增加Profile启动测试。
