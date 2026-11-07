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
    @Override public String description() { return "查看项目代码图与历史记录；业务知识在所属项目文档中维护"; }
    @Override public int order()          { return 36; }
}
