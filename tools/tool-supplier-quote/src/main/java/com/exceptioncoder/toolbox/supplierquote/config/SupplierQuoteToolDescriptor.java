package com.exceptioncoder.toolbox.supplierquote.config;

import com.exceptioncoder.toolbox.common.tool.ToolDescriptor;
import org.springframework.stereotype.Component;

@Component
public class SupplierQuoteToolDescriptor implements ToolDescriptor {
    @Override public String id() { return "supplier-quote"; }
    @Override public String name() { return "供应商报价 H5"; }
    @Override public String description() { return "微信公众号身份、SCM 绑定与供应商报价接口"; }
    @Override public String icon() { return "receipt-text"; }
    @Override public String route() { return "/showcase/supplier-quote/q/demo-quote"; }
    @Override public String group() { return "演示"; }
    @Override public int order() { return 91; }
}
