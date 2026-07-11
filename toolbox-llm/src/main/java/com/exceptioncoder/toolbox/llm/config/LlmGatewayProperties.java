package com.exceptioncoder.toolbox.llm.config;

import com.exceptioncoder.toolbox.common.dynamicconfig.annotation.ConfigDesc;
import com.exceptioncoder.toolbox.common.dynamicconfig.annotation.Refreshable;
import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * 中心化 LLM 网关凭据（统一 OpenAI 兼容出口）。
 *
 * <p>{@link Refreshable} 纳入配置中心「LLM 网关」块——在线改、不重启生效。全站(AI 对话 / java8gu /
 * 访客分析 / 简历优化等)默认复用这一处凭据，不再各模块各存一份（凭据不再局限于「AI 对话」）。
 * 空 key 的网关成员通过 {@code LlmCredentialFallback} 也取这里的实时值。api-key 本地明文存（单机单用户）。</p>
 */
@Component
@ConfigurationProperties(prefix = "toolbox.llm.gateway")
@Refreshable(name = "LLM 网关")
@Getter
@Setter
public class LlmGatewayProperties {

    /** OpenAI 兼容基址，须含 /v1（如 https://4sapi.com/v1）。 */
    @ConfigDesc("统一 OpenAI 兼容网关基址，供 AI 对话、Java 八股等模块复用。")
    private String baseUrl = "https://4sapi.com/v1";

    /** 统一 API Key；建议走环境变量 TOOLBOX_LLM_API_KEY（兼容旧 TOOLBOX_AI_CHAT_API_KEY）。 */
    @ConfigDesc("统一 API Key，本地明文持久化；各模块不再单独维护 Key。")
    private String apiKey = "";

    /** 请求超时（秒）。 */
    @ConfigDesc("统一网关请求超时时间。")
    private int timeoutSeconds = 60;

    /** Java 八股知识补全使用的模型；为空则沿用 java8gu 档位模型池默认模型。 */
    @ConfigDesc("Java 八股知识补全使用的模型名；为空时沿用 LLM 网关 java8gu 档位默认模型。")
    private String java8guModel = "gpt-4o-mini";
}
