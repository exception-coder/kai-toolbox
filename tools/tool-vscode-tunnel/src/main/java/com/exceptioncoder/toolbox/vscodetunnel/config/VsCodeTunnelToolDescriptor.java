package com.exceptioncoder.toolbox.vscodetunnel.config;

import com.exceptioncoder.toolbox.common.tool.ToolDescriptor;
import org.springframework.stereotype.Component;

@Component
public class VsCodeTunnelToolDescriptor implements ToolDescriptor {

    @Override public String id()          { return "vscode-tunnel"; }
    @Override public String name()        { return "VS Code Tunnel"; }
    @Override public String icon()        { return "globe"; }
    @Override public String route()       { return "/tools/vscode-tunnel"; }
    @Override public String group()       { return "系统工具"; }
    @Override public String description() { return "通过 code tunnel 把本地 VS Code 暴露给手机浏览器访问"; }
    @Override public int order()          { return 40; }
}
