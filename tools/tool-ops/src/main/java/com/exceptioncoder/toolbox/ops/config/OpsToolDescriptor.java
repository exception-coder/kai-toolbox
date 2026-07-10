package com.exceptioncoder.toolbox.ops.config;

import com.exceptioncoder.toolbox.common.tool.ToolDescriptor;
import org.springframework.stereotype.Component;

@Component
public class OpsToolDescriptor implements ToolDescriptor {

    @Override public String id()          { return "ops"; }
    @Override public String name()        { return "系统与中间件"; }
    @Override public String icon()        { return "database-zap"; }
    @Override public String route()       { return "/tools/ops"; }
    @Override public String group()       { return "系统工具"; }
    @Override public String description() { return "登记我负责的系统与各环境中间件，一键连上 MySQL / Oracle / Redis 执行查询排查"; }
    @Override public int order()          { return 6; }
}
