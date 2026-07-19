package com.exceptioncoder.toolbox.webppt.config;

import com.exceptioncoder.toolbox.common.tool.ToolDescriptor;
import org.springframework.stereotype.Component;

@Component
public class WebPptToolDescriptor implements ToolDescriptor {

    @Override public String id()          { return "webppt"; }
    @Override public String name()        { return "WebPPT 风格中心"; }
    @Override public String icon()        { return "presentation"; }
    @Override public String route()       { return "/tools/webppt"; }
    @Override public String group()       { return "内容"; }
    @Override public String description() { return "统一、可版本追溯的 WebPPT 风格规范：Design Token、生成提示词与 reveal.js 落地样例"; }
    @Override public int order()          { return 70; }
}
