# Supplier Quote Spring Boot Starter

该模块提供供应商报价 H5 的微信静默授权、公司业务账号首次绑定和稳定 HTTP 契约。公共包根为 `com.regentech_fashion.supplierquote`，通过 Spring Boot AutoConfiguration 加载，不要求宿主应用使用相同根包。

## Maven 接入

```xml
<dependency>
    <groupId>com.regentech_fashion</groupId>
    <artifactId>supplier-quote-spring-boot-starter</artifactId>
    <version>0.1.0-SNAPSHOT</version>
</dependency>
```

## 宿主必须实现

- `SupplierQuoteStore`：OAuth state、H5 会话和微信与公司业务账号绑定存储。
- `SupplierQuotationUseCase`：真实询价加载、草稿保存和报价提交。

Starter 检测到上述两个 Bean 后自动注册 `/api/supplier-quote/public/**` 接口。宿主可以按需提供自己的 `WechatOAuthClient` 或 `BusinessAccountVerifier` Bean 覆盖默认实现。

## 配置前缀

```yaml
regentech:
  supplier-quote:
    wechat:
      mode: official
      app-id: ${SUPPLIER_QUOTE_WECHAT_APP_ID}
      app-secret: ${SUPPLIER_QUOTE_WECHAT_APP_SECRET}
      callback-url: https://kai-tool.exception-coder.com/api/supplier-quote/public/wechat/oauth/callback
      secure-cookie: true
    account:
      mode: http
      verify-url: ${SUPPLIER_QUOTE_ACCOUNT_VERIFY_URL}
```

Forge 由 `toolbox-starter` 直接依赖本 Starter；本地存储与演示报价用例由 Starter 按配置启用，默认使用 SQLite
回归实现，也可通过独立连接池切换到 Oracle，且不会替换 Toolbox 主数据源。生产宿主依赖
Wyoooni 生产宿主直接依赖本 Starter 和公司级 `wyoooni-enterprise-adapter`，宿主配置区只负责装配。
