package com.regentech_fashion.wyoooni.application.supplierquote;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;

/** 供应商报价在 Wyoooni 统一网关中的业务路径配置。 */
@ConfigurationProperties(prefix = "regentech.supplier-quote.wyoooni")
@Getter
@Setter
public class SupplierQuoteWyoooniProperties {
    private boolean enabled;
    private String quotationPath = "/api/supplier-quote-adapter/quotations";
}
