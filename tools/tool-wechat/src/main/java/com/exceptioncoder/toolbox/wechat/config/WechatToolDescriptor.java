package com.exceptioncoder.toolbox.wechat.config;

import com.exceptioncoder.toolbox.common.tool.ToolDescriptor;
import org.springframework.stereotype.Component;

@Component
public class WechatToolDescriptor implements ToolDescriptor {

    @Override public String id()          { return "wechat"; }
    @Override public String name()        { return "微信监控"; }
    @Override public String icon()        { return "message-circle"; }
    @Override public String route()       { return "/tools/wechat"; }
    @Override public String group()       { return "效率工具"; }
    @Override public String description() { return "读微信消息、监听新消息实时推送、发文字。基于 wxauto sidecar，人在外面也能看 PC 微信"; }
    @Override public int order()          { return 35; }
}
