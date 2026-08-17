package com.exceptioncoder.toolbox.supplierquote.config;

import com.exceptioncoder.toolbox.common.dynamicconfig.annotation.ConfigDesc;
import com.exceptioncoder.toolbox.common.dynamicconfig.annotation.Refreshable;
import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/** Forge 的备用业务账号 HTTP 或显式演示校验配置。 */
@Component
@Refreshable(name = "业务账号校验", group = "供应商报价")
@ConfigurationProperties(prefix = "regentech.supplier-quote.account")
@Getter
@Setter
public class SupplierQuoteAccountForgeProperties {
    @ConfigDesc("disabled 默认关闭；mock 为显式演示账号；http 为公司统一业务账号校验接口")
    private String mode = "disabled";

    @ConfigDesc("公司统一业务账号校验接口地址")
    private String verifyUrl = "";
}
