# Supplier Quote Spring Boot Starter

该模块提供供应商报价 H5 的微信静默授权、SCM 首次绑定和稳定 HTTP 契约。公共包根为 `com.regentech_fashion.supplierquote`，通过 Spring Boot AutoConfiguration 加载，不要求宿主应用使用相同根包。

## Maven 接入

```xml
<dependency>
    <groupId>com.regentech_fashion</groupId>
    <artifactId>supplier-quote-spring-boot-starter</artifactId>
    <version>0.1.0-SNAPSHOT</version>
</dependency>
```

## 宿主必须实现

- `SupplierQuoteStore`：OAuth state、H5 会话和微信与 SCM 绑定存储。
- `SupplierQuotationUseCase`：真实询价加载、草稿保存和报价提交。

Starter 检测到上述两个 Bean 后自动注册 `/api/supplier-quote/public/**` 接口。宿主可以按需提供自己的 `WechatOAuthClient` 或 `ScmCredentialVerifier` Bean 覆盖默认实现。

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
    scm:
      mode: http
      verify-url: ${SUPPLIER_QUOTE_SCM_VERIFY_URL}
```

Forge 的 `tool-supplier-quote` 是参考适配器，提供 SQLite Store、演示报价用例和工具菜单注册；真实业务系统不需要依赖它。
