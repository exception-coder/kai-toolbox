package com.exceptioncoder.toolbox.reqpool.config;

import com.exceptioncoder.toolbox.common.tool.ToolDescriptor;
import org.springframework.stereotype.Component;

@Component
public class ReqPoolToolDescriptor implements ToolDescriptor {

    @Override public String id()          { return "reqpool"; }
    @Override public String name()        { return "需求管理池"; }
    @Override public String icon()        { return "layers"; }
    @Override public String route()       { return "/tools/reqpool"; }
    @Override public String group()       { return "AI"; }
    @Override public String description() { return "统一管理产品需求，驱动 PRD 澄清与开发工作台"; }
    @Override public int order()          { return 53; }
}
