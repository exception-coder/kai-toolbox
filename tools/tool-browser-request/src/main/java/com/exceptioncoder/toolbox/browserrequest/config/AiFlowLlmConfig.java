package com.exceptioncoder.toolbox.browserrequest.config;

import com.exceptioncoder.toolbox.browserrequest.ai.FlowScriptAssistant;
import com.exceptioncoder.toolbox.llm.routing.ChatModelRouter;
import dev.langchain4j.service.AiServices;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * 装配 AI 用例脚本生成器。模型向共享网关 {@link ChatModelRouter} 要「flow」档位的路由 ChatModel——
 * 池化/限流/故障转移都在 toolbox-llm 内部完成；未配置该档位时网关自动回退到默认池。
 */
@Configuration
public class AiFlowLlmConfig {

    /** AI 用例脚本生成档位：结构化、需稍强模型，未配置时回退默认池。 */
    private static final String FLOW_TIER = "flow";

    @Bean
    public FlowScriptAssistant flowScriptAssistant(ChatModelRouter router) {
        return AiServices.builder(FlowScriptAssistant.class)
                .chatModel(router.forTier(FLOW_TIER))
                .build();
    }
}
