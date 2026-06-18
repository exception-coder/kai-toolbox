package com.exceptioncoder.toolbox.aichat.config;

import com.exceptioncoder.toolbox.common.tool.ToolDescriptor;
import org.springframework.stereotype.Component;

/** 后端工具注册（{@code GET /api/tools}）。前端菜单以 FeatureManifest 为准，此处仅供服务端发现。 */
@Component
public class AiChatToolDescriptor implements ToolDescriptor {

    @Override
    public String id() {
        return "ai-chat";
    }

    @Override
    public String name() {
        return "AI 对话";
    }

    @Override
    public String icon() {
        return "messages-square";
    }

    @Override
    public String route() {
        return "/tools/ai-chat";
    }

    @Override
    public String group() {
        return "AI 工具";
    }

    @Override
    public String description() {
        return "经 4sapi 直连多模型的 API 流式聊天：会话历史、切模型、系统提示词、图片输入";
    }

    @Override
    public int order() {
        return 51;
    }
}
