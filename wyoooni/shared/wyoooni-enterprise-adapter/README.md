# Wyoooni Enterprise Adapter

Wyoooni 公司级通用适配层，提供跨 ERP、SCM、SRM 的业务账号模型、微信身份绑定存储和统一业务网关客户端。该模块不依赖供应商报价或其他具体业务模块。

```xml
<dependency>
  <groupId>com.regentech_fashion.wyoooni</groupId>
  <artifactId>wyoooni-enterprise-adapter</artifactId>
  <version>0.1.0-SNAPSHOT</version>
</dependency>
```

```yaml
regentech:
  wyoooni:
    enterprise:
      enabled: true
      base-url: https://business-gateway.example.com
      service-token: ${WYOOONI_ENTERPRISE_SERVICE_TOKEN}
      account-verification-path: /api/wyoooni/account-verifications
```

企业账号使用 `accountId + sourceSystem` 唯一识别，通过 `businessPartyId` 关联客户、供应商或其他业务伙伴。新增来源系统时只增加数据值，不修改模块类型。

宿主需要通过自己的迁移工具执行 `src/main/resources/database/oracle-wyoooni-enterprise-schema.sql`。该脚本不会自动执行。
