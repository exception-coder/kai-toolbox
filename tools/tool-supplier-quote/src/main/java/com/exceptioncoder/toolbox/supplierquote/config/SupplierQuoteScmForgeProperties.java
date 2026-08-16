package com.exceptioncoder.toolbox.supplierquote.config;

import com.exceptioncoder.toolbox.common.dynamicconfig.annotation.ConfigDesc;
import com.exceptioncoder.toolbox.common.dynamicconfig.annotation.Refreshable;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * Forge 配置中心的 SCM 账号校验配置目录。
 */
@Component
@Refreshable(name = "SCM 账号校验", group = "供应商报价")
@ConfigurationProperties(prefix = "regentech.supplier-quote.scm")
public class SupplierQuoteScmForgeProperties {
    @ConfigDesc("mock 为演示账号；http 为真实 SCM 登录校验接口")
    private String mode = "mock";

    @ConfigDesc("真实 SCM 登录校验接口地址")
    private String verifyUrl = "";

    public String getMode() { return mode; }
    public void setMode(String mode) { this.mode = mode; }
    public String getVerifyUrl() { return verifyUrl; }
    public void setVerifyUrl(String verifyUrl) { this.verifyUrl = verifyUrl; }
}
