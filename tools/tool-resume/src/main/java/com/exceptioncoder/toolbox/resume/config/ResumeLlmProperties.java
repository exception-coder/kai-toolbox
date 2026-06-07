package com.exceptioncoder.toolbox.resume.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * 简历优化「高质量」引擎配置（{@code toolbox.resume.llm.quality}）。
 *
 * <p>「快速」引擎复用 {@code spring.ai.openai.*} 自动配置的 ChatModel；本配置只描述需要
 * 单独装配的「高质量」引擎，默认 DeepSeek deepseek-reasoner（同一把 key）。可改 base-url / api-key
 * 接到别的 OpenAI 兼容 Provider（OpenAI / 本地 Ollama 等）。
 */
@ConfigurationProperties("toolbox.resume.llm")
public class ResumeLlmProperties {

    private Engine quality = new Engine();

    public Engine getQuality() {
        return quality;
    }

    public void setQuality(Engine quality) {
        this.quality = quality;
    }

    public static class Engine {
        /** OpenAI 兼容 base-url，不带 /v1 */
        private String baseUrl = "https://api.deepseek.com";
        /** API key；留占位符即可启动，调用时才校验 */
        private String apiKey = "local-no-key-needed";
        private String model = "deepseek-reasoner";
        private Double temperature = 0.4;

        public String getBaseUrl() {
            return baseUrl;
        }

        public void setBaseUrl(String baseUrl) {
            this.baseUrl = baseUrl;
        }

        public String getApiKey() {
            return apiKey;
        }

        public void setApiKey(String apiKey) {
            this.apiKey = apiKey;
        }

        public String getModel() {
            return model;
        }

        public void setModel(String model) {
            this.model = model;
        }

        public Double getTemperature() {
            return temperature;
        }

        public void setTemperature(Double temperature) {
            this.temperature = temperature;
        }
    }
}
