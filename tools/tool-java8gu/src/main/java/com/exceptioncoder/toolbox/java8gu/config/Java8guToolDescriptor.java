package com.exceptioncoder.toolbox.java8gu.config;

import com.exceptioncoder.toolbox.common.tool.ToolDescriptor;
import org.springframework.stereotype.Component;

@Component
public class Java8guToolDescriptor implements ToolDescriptor {

    @Override public String id()          { return "java8gu"; }
    @Override public String name()        { return "Java 八股秘书"; }
    @Override public String icon()        { return "graduation-cap"; }
    @Override public String route()       { return "/tools/java8gu"; }
    @Override public String group()       { return "内容工具"; }
    @Override public String description() { return "Java 八股题库向量检索 + 复习问答 Agent"; }
    @Override public int order()          { return 37; }
}
