package com.exceptioncoder.toolbox.resume.config;

import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.openai.OpenAiChatModel;
import org.springframework.ai.openai.OpenAiChatOptions;
import org.springframework.ai.openai.api.OpenAiApi;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * 简历优化「高质量」引擎的 ChatClient 装配。
 *
 * <p>「快速」引擎走 spring-ai-starter-model-openai 自动配置的 ChatModel（见 application.yml
 * {@code spring.ai.openai.*}）。这里只手动多建一个引擎，按 {@link ResumeLlmProperties} 的
 * base-url / api-key / model 指向另一个（可不同）OpenAI 兼容端点。
 */
@Configuration
@EnableConfigurationProperties(ResumeLlmProperties.class)
public class ResumeChatClientConfig {

    /** 高质量引擎 ChatClient；默认 DeepSeek deepseek-reasoner。 */
    @Bean("resumeQualityChatClient")
    public ChatClient resumeQualityChatClient(ResumeLlmProperties props) {
        ResumeLlmProperties.Engine q = props.getQuality();
        OpenAiApi api = OpenAiApi.builder()
                .baseUrl(q.getBaseUrl())
                .apiKey(q.getApiKey())
                .build();
        OpenAiChatModel model = OpenAiChatModel.builder()
                .openAiApi(api)
                .defaultOptions(OpenAiChatOptions.builder()
                        .model(q.getModel())
                        .temperature(q.getTemperature())
                        .build())
                .build();
        return ChatClient.create(model);
    }
}
