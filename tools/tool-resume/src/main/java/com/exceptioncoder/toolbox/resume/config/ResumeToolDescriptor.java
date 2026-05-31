package com.exceptioncoder.toolbox.resume.config;

import com.exceptioncoder.toolbox.common.tool.ToolDescriptor;
import org.springframework.stereotype.Component;

@Component
public class ResumeToolDescriptor implements ToolDescriptor {

    @Override public String id()          { return "resume"; }
    @Override public String name()        { return "个人简历"; }
    @Override public String icon()        { return "user-square"; }
    @Override public String route()       { return "/tools/resume"; }
    @Override public String group()       { return "内容工具"; }
    @Override public String description() { return "在线简历编辑：多模板 + 多主色，导出 PNG / PDF，数据存 SQLite"; }
    @Override public int order()          { return 25; }
}
