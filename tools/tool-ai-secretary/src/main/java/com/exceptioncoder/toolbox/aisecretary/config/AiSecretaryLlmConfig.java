package com.exceptioncoder.toolbox.aisecretary.config;

import com.exceptioncoder.toolbox.aisecretary.ai.Capturer;
import dev.langchain4j.model.openai.OpenAiChatModel;
import dev.langchain4j.service.AiServices;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Duration;

/**
 * 手动装配 LangChain4j：OpenAiChatModel（指向本地 Ollama）+ Capturer 声明式 AiService。
 *
 * <p>刻意手动装配而非用 langchain4j-spring-boot-starter——学习项目要看清框架怎么被接进 Spring。
 * 这里的 ChatModel 是 LangChain4j 的 dev.langchain4j.model.chat.ChatModel，与 tool-resume 用的
 * Spring AI ChatModel 是不同包的不同类型，互不冲突。
 */
@Configuration
@EnableConfigurationProperties(AiSecretaryProperties.class)
public class AiSecretaryLlmConfig {

    @Bean
    public OpenAiChatModel aiSecretaryChatModel(AiSecretaryProperties props) {
        AiSecretaryProperties.Llm llm = props.getLlm();
        return OpenAiChatModel.builder()
                .baseUrl(llm.getBaseUrl())
                .apiKey(llm.getApiKey())
                .modelName(llm.getModel())
                .temperature(llm.getTemperature())
                .timeout(Duration.ofSeconds(llm.getTimeoutSeconds()))
                .logRequests(true)
                .logResponses(true)
                .build();
    }

    @Bean
    public Capturer capturer(OpenAiChatModel aiSecretaryChatModel) {
        return AiServices.builder(Capturer.class)
                .chatModel(aiSecretaryChatModel)
                .build();
    }
}
