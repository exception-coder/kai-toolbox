package com.exceptioncoder.toolbox.browserrequest.config;

import com.exceptioncoder.toolbox.common.tool.ToolDescriptor;
import org.springframework.stereotype.Component;

@Component
public class BrowserRequestDescriptor implements ToolDescriptor {
    @Override public String id()          { return "browser-request"; }
    @Override public String name()        { return "站点录制编排"; }
    @Override public String icon()        { return "globe"; }
    @Override public String route()       { return "/tools/browser-request"; }
    @Override public String group()       { return "网络工具"; }
    @Override public String description() { return "在浏览器里点一遍即可录制全 HTTP 调用，自由编排参数化后一键回放"; }
    @Override public int order()          { return 55; }
}
