package com.exceptioncoder.toolbox.java8gu.config;

import com.exceptioncoder.toolbox.java8gu.ai.Java8guAssistant;
import com.exceptioncoder.toolbox.java8gu.ai.Java8guEnricher;
import com.exceptioncoder.toolbox.llm.routing.ChatModelRouter;
import dev.langchain4j.service.AiServices;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * 装配 Java 八股复习助手：向共享网关要「java8gu」档位的路由 ChatModel；未配置该档位时网关回退默认（本地 Ollama）。
 * 纯措辞角色——不挂工具、不做检索，检索由 Java8guRagService 在代码层完成。
 */
@Configuration
public class Java8guLlmConfig {

    private static final String JAVA8GU_TIER = "java8gu";

    @Bean
    public Java8guAssistant java8guAssistant(ChatModelRouter router) {
        return AiServices.builder(Java8guAssistant.class)
                .chatModel(router.forTier(JAVA8GU_TIER))
                .build();
    }

    /** 知识补全器：把非结构化正文加工成图解/问答/易错点/深度讲解，结果落 SQLite 缓存。 */
    @Bean
    public Java8guEnricher java8guEnricher(ChatModelRouter router) {
        return AiServices.builder(Java8guEnricher.class)
                .chatModel(router.forTier(JAVA8GU_TIER))
                .build();
    }
}
