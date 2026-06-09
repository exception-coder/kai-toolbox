package com.exceptioncoder.toolbox.aisecretary.config;

import com.exceptioncoder.toolbox.common.tool.ToolDescriptor;
import org.springframework.stereotype.Component;

@Component
public class AiSecretaryToolDescriptor implements ToolDescriptor {

    @Override public String id()          { return "ai-secretary"; }
    @Override public String name()        { return "AI 秘书"; }
    @Override public String icon()        { return "bot"; }
    @Override public String route()       { return "/tools/ai-secretary"; }
    @Override public String group()       { return "内容工具"; }
    @Override public String description() { return "随手记自动分类抽取、自然语言回忆的个人助理 Agent"; }
    @Override public int order()          { return 36; }
}
