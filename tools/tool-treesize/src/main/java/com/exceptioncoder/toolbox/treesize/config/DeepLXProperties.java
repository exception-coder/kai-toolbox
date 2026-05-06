package com.exceptioncoder.toolbox.treesize.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Binds {@code toolbox.deeplx.*}. Supports two translation providers:
 * <ul>
 *   <li>{@code deeplx} — lightweight local DeepL proxy (free, may hit rate limits on heavy use).</li>
 *   <li>{@code ollama} — local LLM via Ollama REST API; no rate limits, fully offline.</li>
 * </ul>
 */
@ConfigurationProperties(prefix = "toolbox.deeplx")
public class DeepLXProperties {

    /** Translation provider: {@code deeplx} or {@code ollama}. */
    private String provider = "ollama";

    /** Base URL.
     *  deeplx: full translate endpoint, e.g. {@code http://localhost:1188/translate}.
     *  ollama: base URL only, e.g. {@code http://localhost:11434}.
     */
    private String url = "http://localhost:11434";

    /** DeepLX only: Bearer token when deeplx is started with {@code -token}. */
    private String token = "";

    /** Ollama only: model name to use for translation. */
    private String ollamaModel = "qwen2.5:3b";

    /** Target language.
     *  deeplx: DeepL language code, e.g. {@code ZH}.
     *  ollama: natural language name in the prompt, e.g. {@code 中文}.
     */
    private String targetLang = "ZH";

    /** Max simultaneous in-flight translation requests. */
    private int maxConcurrent = 4;

    /** Per-request timeout in seconds. Ollama first-token latency can be 2-3 s on GPU. */
    private int timeoutSeconds = 30;

    public boolean isEnabled() {
        return url != null && !url.isBlank();
    }

    public String getProvider() { return provider; }
    public void setProvider(String provider) { this.provider = provider == null ? "ollama" : provider.trim().toLowerCase(); }

    public String getUrl() { return url; }
    public void setUrl(String url) { this.url = url == null ? "" : url.trim(); }

    public String getToken() { return token; }
    public void setToken(String token) { this.token = token == null ? "" : token.trim(); }

    public String getOllamaModel() { return ollamaModel; }
    public void setOllamaModel(String ollamaModel) { this.ollamaModel = ollamaModel == null ? "qwen2.5:3b" : ollamaModel.trim(); }

    public String getTargetLang() { return targetLang; }
    public void setTargetLang(String targetLang) { this.targetLang = targetLang == null ? "ZH" : targetLang.trim(); }

    public int getMaxConcurrent() { return maxConcurrent; }
    public void setMaxConcurrent(int maxConcurrent) { this.maxConcurrent = Math.max(1, maxConcurrent); }

    public int getTimeoutSeconds() { return timeoutSeconds; }
    public void setTimeoutSeconds(int timeoutSeconds) { this.timeoutSeconds = Math.max(5, timeoutSeconds); }
}
