package com.exceptioncoder.toolbox.claudechat.config;

import com.exceptioncoder.toolbox.claudechat.ai.ReviewIntentClassifier;
import com.exceptioncoder.toolbox.llm.routing.ChatModelRouter;
import dev.langchain4j.service.AiServices;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** 评审分类使用 Forge 共享轻量模型，不依赖 Codex 或 Claude Code 的回复协议。 */
@Configuration
public class ReviewIntentLlmConfig {

    @Bean
    public ReviewIntentClassifier reviewIntentClassifier(ChatModelRouter router) {
        return AiServices.builder(ReviewIntentClassifier.class)
                .chatModel(router.forTier("capture"))
                .build();
    }
}
