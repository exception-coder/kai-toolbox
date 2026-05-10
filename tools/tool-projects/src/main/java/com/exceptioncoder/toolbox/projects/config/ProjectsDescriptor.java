package com.exceptioncoder.toolbox.projects.config;

import com.exceptioncoder.toolbox.common.tool.ToolDescriptor;
import org.springframework.stereotype.Component;

/**
 * 「项目管理」工具元数据。被 {@link com.exceptioncoder.toolbox.common.tool.ToolRegistry} 收集，
 * 通过 {@code GET /api/tools} 暴露给前端用于跨工具发现（当前 UI 直接读 frontend FeatureManifest）。
 */
@Component
public class ProjectsDescriptor implements ToolDescriptor {

    @Override public String id()          { return "projects"; }
    @Override public String name()        { return "项目管理"; }
    @Override public String icon()        { return "folder-git-2"; }
    @Override public String route()       { return "/tools/projects"; }
    @Override public String group()       { return "系统工具"; }
    @Override public String description() { return "扫描本地项目目录，一键跳转 Web 终端启动 claude"; }
    @Override public int order()          { return 10; }
}
