package com.exceptioncoder.toolbox.workline.config;

import com.exceptioncoder.toolbox.common.tool.ToolDescriptor;
import org.springframework.stereotype.Component;

@Component
public class WorklineToolDescriptor implements ToolDescriptor {

    @Override public String id()          { return "workline"; }
    @Override public String name()        { return "工作线"; }
    @Override public String icon()        { return "git-branch"; }
    @Override public String route()       { return "/tools/workline"; }
    @Override public String group()       { return "内容工具"; }
    @Override public String description() { return "记录工作主线下的核心内容与作出的成果，数据存 SQLite"; }
    @Override public int order()          { return 26; }
}
