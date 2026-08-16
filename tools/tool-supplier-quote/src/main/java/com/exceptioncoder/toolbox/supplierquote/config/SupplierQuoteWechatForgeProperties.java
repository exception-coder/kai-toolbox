package com.exceptioncoder.toolbox.supplierquote.config;

import com.exceptioncoder.toolbox.common.dynamicconfig.annotation.ConfigDesc;
import com.exceptioncoder.toolbox.common.dynamicconfig.annotation.Refreshable;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * Forge 配置中心的微信公众号静默授权配置目录。
 */
@Component
@Refreshable(name = "微信公众号静默授权", group = "供应商报价")
@ConfigurationProperties(prefix = "regentech.supplier-quote.wechat")
public class SupplierQuoteWechatForgeProperties {
    @ConfigDesc("mock 为本地验证；official 为微信公众号静默授权")
    private String mode = "mock";

    @ConfigDesc("微信公众号 AppID")
    private String appId = "dev-app-id";

    @ConfigDesc("微信公众号 AppSecret，仅在 Forge 管理端维护")
    private String appSecret = "";

    @ConfigDesc("微信 OAuth 回调完整 HTTPS 地址")
    private String callbackUrl =
            "https://kai-tool.exception-coder.com/api/supplier-quote/public/wechat/oauth/callback";

    @ConfigDesc("mock 模式使用的开发身份")
    private String mockOpenid = "forge-demo-openid";

    @ConfigDesc("HTTPS 环境必须启用 Secure Cookie")
    private boolean secureCookie = true;

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
