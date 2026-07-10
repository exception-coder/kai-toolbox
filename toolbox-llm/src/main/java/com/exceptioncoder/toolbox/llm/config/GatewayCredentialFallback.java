package com.exceptioncoder.toolbox.llm.config;

import com.exceptioncoder.toolbox.llm.spi.LlmCredentialFallback;
import org.springframework.stereotype.Component;

/**
 * 网关自带的凭据兜底实现：空 key 的池成员统一复用中心 {@link LlmGatewayProperties} 的实时凭据。
 * 取代原先由「AI 对话」模块提供的兜底——凭据现在中心化，不再局限于某个业务模块。
 * 返回实时值（委托 @Refreshable 配置对象），用户在配置中心改完下次调用即生效。
 */
@Component
public class GatewayCredentialFallback implements LlmCredentialFallback {

    private final LlmGatewayProperties props;

    public GatewayCredentialFallback(LlmGatewayProperties props) {
        this.props = props;
    }

    @Override
    public String apiKey() {
        return props.getApiKey();
    }

    @Override
    public String baseUrl() {
        return props.getBaseUrl();
    }
}
