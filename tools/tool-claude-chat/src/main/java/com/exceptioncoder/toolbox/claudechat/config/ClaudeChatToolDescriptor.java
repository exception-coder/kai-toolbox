package com.exceptioncoder.toolbox.claudechat.config;

import com.exceptioncoder.toolbox.common.tool.ToolDescriptor;
import org.springframework.stereotype.Component;

@Component
public class ClaudeChatToolDescriptor implements ToolDescriptor {

    @Override public String id()          { return "claude-chat"; }
    @Override public String name()        { return "Claude 助手"; }
    @Override public String icon()        { return "bot-message-square"; }
    @Override public String route()       { return "/tools/claude-chat"; }
    @Override public String group()       { return "AI 工具"; }
    @Override public String description() { return "移动端聊天式驱动 Claude：流式回复、可视化批准、随时切会话、完成通知"; }
    @Override public int order()          { return 50; }
}
