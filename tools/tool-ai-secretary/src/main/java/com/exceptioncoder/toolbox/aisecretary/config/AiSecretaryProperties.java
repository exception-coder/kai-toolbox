package com.exceptioncoder.toolbox.aisecretary.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * AI 秘书的 LLM 接入配置。默认指向本地 Ollama 的 OpenAI 兼容端点 + qwen2.5:7b-instruct，
 * 全部可用环境变量覆盖；换云端只改 base-url / model / api-key。
 */
@Data
@ConfigurationProperties("toolbox.ai-secretary")
public class AiSecretaryProperties {

    private final Llm llm = new Llm();

    @Data
    public static class Llm {
        /** OpenAI 兼容端点（含 /v1）。Ollama 默认 http://localhost:11434/v1。 */
        private String baseUrl = "http://localhost:11434/v1";
        /** Ollama 不校验 key，占位即可；云端走环境变量。 */
        private String apiKey = "ollama";
        private String model = "qwen2.5:7b-instruct";
        private double temperature = 0.2;
        private int timeoutSeconds = 60;
    }
}
