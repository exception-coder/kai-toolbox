package com.exceptioncoder.toolbox.quicklaunch.config;

import com.exceptioncoder.toolbox.common.tool.ToolDescriptor;
import org.springframework.stereotype.Component;

@Component
public class QuickLaunchToolDescriptor implements ToolDescriptor {

    @Override public String id() { return "quick-launch"; }
    @Override public String name() { return "快捷入口"; }
    @Override public String icon() { return "rocket"; }
    @Override public String route() { return "/tools/quick-launch"; }
    @Override public String group() { return "效率"; }
    @Override public String description() { return "登记并快速打开常用工作站点"; }
    @Override public int order() { return 1; }
}
