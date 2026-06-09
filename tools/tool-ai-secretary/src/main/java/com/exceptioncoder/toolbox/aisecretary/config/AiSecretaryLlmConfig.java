package com.exceptioncoder.toolbox.aisecretary.config;

import com.exceptioncoder.toolbox.aisecretary.ai.Capturer;
import com.exceptioncoder.toolbox.llm.routing.ChatModelRouter;
import dev.langchain4j.service.AiServices;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * 装配记录态的 Capturer 声明式 AiService。
 *
 * <p>模型不再由本模块直接构建，而是向共享网关 {@link ChatModelRouter} 要「capture」档位的
 * 路由 ChatModel——池化 / 限流 / 故障转移都在 toolbox-llm 内部完成，对本模块透明。
 * 未配置该档位时网关自动回退到默认（本地 Ollama）。
 */
@Configuration
public class AiSecretaryLlmConfig {

    /** 记录态用的档位：高频、可用便宜/本地模型。 */
    private static final String CAPTURE_TIER = "capture";

    @Bean
    public Capturer capturer(ChatModelRouter router) {
        return AiServices.builder(Capturer.class)
                .chatModel(router.forTier(CAPTURE_TIER))
                .build();
    }
}
