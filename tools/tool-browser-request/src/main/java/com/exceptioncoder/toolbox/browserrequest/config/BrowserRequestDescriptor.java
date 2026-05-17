package com.exceptioncoder.toolbox.browserrequest.config;

import com.exceptioncoder.toolbox.common.tool.ToolDescriptor;
import org.springframework.stereotype.Component;

@Component
public class BrowserRequestDescriptor implements ToolDescriptor {
    @Override public String id()          { return "browser-request"; }
    @Override public String name()        { return "浏览器请求"; }
    @Override public String icon()        { return "globe"; }
    @Override public String route()       { return "/tools/browser-request"; }
    @Override public String group()       { return "网络工具"; }
    @Override public String description() { return "打开站点登录后，用同一会话重放任意 HTTP 请求（含 curl 粘贴）"; }
    @Override public int order()          { return 55; }
}
