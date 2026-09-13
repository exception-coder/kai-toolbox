package com.exceptioncoder.toolbox.ops.config;

import com.exceptioncoder.toolbox.common.tool.ToolDescriptor;
import org.springframework.stereotype.Component;

@Component
public class OpsToolDescriptor implements ToolDescriptor {

    @Override public String id()          { return "ops"; }
    @Override public String name()        { return "系统资源与测试账号"; }
    @Override public String icon()        { return "database-zap"; }
    @Override public String route()       { return "/tools/reqpool/resources"; }
    @Override public String group()       { return "系统工具"; }
    @Override public String description() { return "关联项目库系统与中间件、测试账号，供 Tool 和 MCP 发现、查询与验证"; }
    @Override public int order()          { return 6; }
}
