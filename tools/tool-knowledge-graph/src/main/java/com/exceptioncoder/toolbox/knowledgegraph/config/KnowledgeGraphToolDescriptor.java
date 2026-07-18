package com.exceptioncoder.toolbox.knowledgegraph.config;

import com.exceptioncoder.toolbox.common.tool.ToolDescriptor;
import org.springframework.stereotype.Component;

@Component
public class KnowledgeGraphToolDescriptor implements ToolDescriptor {

    @Override public String id()          { return "knowledge-graph"; }
    @Override public String name()        { return "知识图谱管理"; }
    @Override public String icon()        { return "network"; }
    @Override public String route()       { return "/tools/project-workspace"; }
    @Override public String group()       { return "运维工具"; }
    @Override public String description() { return "检测项目在 Graphify / domain-knowledge / cross-topology 的登记状态；前端已整合进项目工作台，无独立页面"; }
    @Override public int order()          { return 36; }
}
