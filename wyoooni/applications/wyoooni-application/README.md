# Wyoooni Application

公司 H5 模块的独立 Spring Boot 宿主。它不依赖 Forge，当前装配供应商报价 H5、环境化业务主库、
ERP Oracle 只读账号验证和公司报价业务网关。

业务主库按 Spring Profile 隔离：

- `dev`：SQLite，使用 `WYOOONI_SQLITE_FILE` 指定文件，应用自动执行幂等初始化脚本。
- `prod`：Oracle，使用 `WYOOONI_BUSINESS_DB_*` 提供独立 Schema 凭据和 Hikari 参数；DDL 由数据库发布流程执行。

ERP/SCM 账号验证库使用另一组 `WYOOONI_ACCOUNT_ORACLE_*` 只读连接，禁止与 H5 业务主库复用账号。

开发启动：

```powershell
mvn -pl wyoooni/applications/wyoooni-application -am spring-boot:run
```

生产打包与运行：

```powershell
mvn -pl wyoooni/applications/wyoooni-application -am clean package
java -jar wyoooni/applications/wyoooni-application/target/wyoooni-application.jar
```

生产运行需显式启用 Profile：

```powershell
java -jar wyoooni/applications/wyoooni-application/target/wyoooni-application.jar --spring.profiles.active=prod
```

完整打包会执行 `npm run h5:build` 并将独立 H5 嵌入 Jar。敏感配置只通过环境变量或受 Git 忽略的
`scripts/run-tools.d/60-supplier-quote.conf` 提供。
