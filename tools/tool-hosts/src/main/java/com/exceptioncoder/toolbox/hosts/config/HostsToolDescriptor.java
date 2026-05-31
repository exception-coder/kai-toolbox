package com.exceptioncoder.toolbox.hosts.config;

import com.exceptioncoder.toolbox.common.tool.ToolDescriptor;
import org.springframework.stereotype.Component;

@Component
public class HostsToolDescriptor implements ToolDescriptor {

    @Override public String id()          { return "hosts"; }
    @Override public String name()        { return "主机管理"; }
    @Override public String icon()        { return "server"; }
    @Override public String route()       { return "/tools/hosts"; }
    @Override public String group()       { return "运维工具"; }
    @Override public String description() { return "统一登记 ECS / 本地 / NAS 等 SSH 主机，供磁盘扫描、frp 配置等工具复用"; }
    @Override public int order()          { return 30; }
}
