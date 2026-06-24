package com.exceptioncoder.toolbox.welfaresign.config;

import com.exceptioncoder.toolbox.common.tool.ToolDescriptor;
import org.springframework.stereotype.Component;

@Component
public class WelfareSignToolDescriptor implements ToolDescriptor {
    @Override public String id() { return "welfare-sign"; }
    @Override public String name() { return "福利签收"; }
    @Override public String icon() { return "badge-check"; }
    @Override public String route() { return "/tools/welfare-sign"; }
    @Override public String group() { return "企业工具"; }
    @Override public String description() { return "节假日福利线上签收、白名单校验、签名查询与导出"; }
    @Override public int order() { return 64; }
}
