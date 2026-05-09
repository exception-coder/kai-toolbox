package com.exceptioncoder.toolbox.webterm.config;

import com.exceptioncoder.toolbox.common.tool.ToolDescriptor;
import org.springframework.stereotype.Component;

@Component
public class WebTermDescriptor implements ToolDescriptor {

    @Override public String id()          { return "webterm"; }
    @Override public String name()        { return "Web 终端"; }
    @Override public String icon()        { return "terminal-square"; }
    @Override public String route()       { return "/tools/webterm"; }
    @Override public String group()       { return "系统工具"; }
    @Override public String description() { return "在浏览器中打开 PowerShell / cmd 命令行"; }
    @Override public int order()          { return 30; }
}
