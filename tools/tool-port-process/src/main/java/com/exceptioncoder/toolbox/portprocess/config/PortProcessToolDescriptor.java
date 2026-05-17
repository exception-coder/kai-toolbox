package com.exceptioncoder.toolbox.portprocess.config;

import com.exceptioncoder.toolbox.common.tool.ToolDescriptor;
import org.springframework.stereotype.Component;

@Component
public class PortProcessToolDescriptor implements ToolDescriptor {

    @Override public String id()          { return "port-process"; }
    @Override public String name()        { return "端口进程查询"; }
    @Override public String icon()        { return "network"; }
    @Override public String route()       { return "/tools/port-process"; }
    @Override public String group()       { return "系统工具"; }
    @Override public String description() { return "按端口反查占用进程，自动适配 Windows / Linux / macOS，覆盖 IPv4 与 IPv6"; }
    @Override public int order()          { return 25; }
}
