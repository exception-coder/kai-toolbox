package com.exceptioncoder.toolbox.docker.config;

import com.exceptioncoder.toolbox.common.tool.ToolDescriptor;
import org.springframework.stereotype.Component;

@Component
public class DockerToolDescriptor implements ToolDescriptor {

    @Override public String id()          { return "docker"; }
    @Override public String name()        { return "Docker 治理"; }
    @Override public String icon()        { return "boxes"; }
    @Override public String route()       { return "/tools/docker"; }
    @Override public String group()       { return "运维工具"; }
    @Override public String description() { return "远程主机 Docker 应用编排：登记、启停、配置、日志"; }
    @Override public int order()          { return 35; }
}
