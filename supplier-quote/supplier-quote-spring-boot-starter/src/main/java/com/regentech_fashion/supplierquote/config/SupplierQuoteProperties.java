package com.regentech_fashion.supplierquote.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
@ConfigurationProperties(prefix = "regentech.supplier-quote")
public class SupplierQuoteProperties {
    private final Wechat wechat = new Wechat();
    private final Scm scm = new Scm();

    public Wechat getWechat() { return wechat; }
    public Scm getScm() { return scm; }

    public static class Wechat {
        private String mode = "mock";
        private String appId = "dev-app-id";
        private String appSecret = "";
        private String callbackUrl = "";
        private String mockOpenid = "forge-demo-openid";
        private boolean secureCookie;

        public String getMode() { return mode; }
        public void setMode(String mode) { this.mode = mode; }
        public String getAppId() { return appId; }
        public void setAppId(String appId) { this.appId = appId; }
        public String getAppSecret() { return appSecret; }
        public void setAppSecret(String appSecret) { this.appSecret = appSecret; }
        public String getCallbackUrl() { return callbackUrl; }
        public void setCallbackUrl(String callbackUrl) { this.callbackUrl = callbackUrl; }
        public String getMockOpenid() { return mockOpenid; }
        public void setMockOpenid(String mockOpenid) { this.mockOpenid = mockOpenid; }
        public boolean isSecureCookie() { return secureCookie; }
        public void setSecureCookie(boolean secureCookie) { this.secureCookie = secureCookie; }
    }

    public static class Scm {
        private String mode = "mock";
        private String verifyUrl = "";

        public String getMode() { return mode; }
        public void setMode(String mode) { this.mode = mode; }
        public String getVerifyUrl() { return verifyUrl; }
        public void setVerifyUrl(String verifyUrl) { this.verifyUrl = verifyUrl; }
    }
}
