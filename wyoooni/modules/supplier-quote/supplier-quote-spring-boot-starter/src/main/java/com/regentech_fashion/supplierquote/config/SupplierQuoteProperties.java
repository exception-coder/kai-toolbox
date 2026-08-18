package com.regentech_fashion.supplierquote.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "regentech.supplier-quote")
@Getter
public class SupplierQuoteProperties {
    private final Wechat wechat = new Wechat();
    private final Account account = new Account();
    private final MarketQuote marketQuote = new MarketQuote();

    @Getter
    @Setter
    public static class Wechat {
        private String mode = "mock";
        private String appId = "dev-app-id";
        private String appSecret = "";
        private String callbackUrl = "";
        private String subscriptionCallbackUrl = "";
        private String subscriptionTemplateId = "";
        private String publicBaseUrl = "";
        private int subscriptionScene = 1000;
        private String subscriptionTitle = "供应商报价通知";
        private String subscriptionContent = "您有新的市场报价任务，请点击进入报价。";
        private String mockOpenid = "forge-demo-openid";
        private boolean secureCookie;
        private boolean localDevelopmentEnabled;
    }

    @Getter
    @Setter
    public static class Account {
        private String mode = "mock";
        private String verifyUrl = "";
    }

    @Getter
    @Setter
    public static class MarketQuote {
        private String provider = "srm-http";
        private String baseUrl = "";
        private String secretKey = "";
        private int connectTimeoutMillis = 5_000;
        private int requestTimeoutMillis = 10_000;
        private String listPath = "/admin-api/system/open-api/sup-update-product/sup-select";
        private String submitPath = "/admin-api/system/open-api/sup-update-product-price/create";
        private String batchSubmitPath = "/admin-api/system/open-api/sup-update-product-price/batch-create";
        private String revokePath = "/admin-api/system/open-api/sup-update-product-price/revoke-price";
        private String qualityStandardsPath = "/admin-api/system/open-api/yarn-rating-standards/get-by-product-id";
    }
}
