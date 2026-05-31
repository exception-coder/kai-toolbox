package com.exceptioncoder.toolbox.frp.config;

import com.exceptioncoder.toolbox.common.tool.ToolDescriptor;
import org.springframework.stereotype.Component;

@Component
public class FrpToolDescriptor implements ToolDescriptor {

    @Override public String id()          { return "frp-config"; }
    @Override public String name()        { return "frp 可视化配置"; }
    @Override public String icon()        { return "share-2"; }
    @Override public String route()       { return "/tools/frp-config"; }
    @Override public String group()       { return "运维工具"; }
    @Override public String description() { return "通过 SSH 远程编辑 frps/frpc 的 TOML 配置，多端口/HTTP/UDP 一键生成，并附原理说明"; }
    @Override public int order()          { return 35; }
}
