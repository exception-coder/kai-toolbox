package com.exceptioncoder.toolbox.llm.spi;

/**
 * 共享 LLM 网关（toolbox-llm）成员在「未显式配置 key」时的凭据兜底来源（SPI）。
 *
 * <p>由网关（消费方）定义、由具体模块提供实现（如 tool-ai-chat 基于其 {@code @Refreshable} 配置）。
 * toolbox-llm 侧可选注入（{@code ObjectProvider}），缺省即不启用兜底、行为回退到静态构建。
 * 目的：让空 key 的网关成员复用「AI 对话」配置中心里的实时 4sapi 凭据，消除多头配置。</p>
 *
 * <p>返回值应为<b>实时值</b>（实现方通常委托一个刷新态配置对象），调用方每次取用即最新。</p>
 */
public interface LlmCredentialFallback {

    /** 实时 API Key；可能为空（未配置时）。 */
    String apiKey();

    /** 实时 baseUrl（OpenAI 兼容，含 /v1）；可能为空，为空时调用方回退成员自身 baseUrl。 */
    String baseUrl();
}
