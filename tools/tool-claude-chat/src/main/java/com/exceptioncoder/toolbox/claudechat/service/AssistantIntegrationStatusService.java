package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.api.dto.AssistantIntegrationStatusView;
import com.exceptioncoder.toolbox.claudechat.config.ClaudeChatWsProperties;
import com.exceptioncoder.toolbox.common.auth.config.AuthProperties;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;

import java.util.List;

/** 读取嵌入式业务助手当前生效的非敏感接入配置。 */
@Service
public class AssistantIntegrationStatusService {

    private static final String WILDCARD_ORIGIN = "*";
    private static final String LOADER_PATH = "/assistant-sdk/loader.js";
    private static final String EXTERNAL_LOGIN_PATH = "/api/auth/external-login";
    private static final String CONSULT_WEBSOCKET_PATH = "/api/claude-chat/consult/ws";
    private static final String PROJECT_BINDINGS_PATH = "/api/claude-chat/project-route-bindings";

    private final ObjectProvider<AuthProperties> authPropertiesProvider;
    private final ClaudeChatWsProperties webSocketProperties;

    public AssistantIntegrationStatusService(
            ObjectProvider<AuthProperties> authPropertiesProvider,
            ClaudeChatWsProperties webSocketProperties
    ) {
        this.authPropertiesProvider = authPropertiesProvider;
        this.webSocketProperties = webSocketProperties;
    }

    /** 返回运行时已绑定的配置值，不返回 Token、密码或签名密钥。 */
    public AssistantIntegrationStatusView current() {
        AuthProperties authProperties = authPropertiesProvider.getIfAvailable();
        boolean externalLoginEnabled = authProperties != null
                && authProperties.getExternalLogin().isEnabled();
        List<String> loginOrigins = authProperties == null
                ? List.of()
                : immutable(authProperties.getExternalLogin().getAllowedOrigins());
        List<String> webSocketOrigins = immutable(webSocketProperties.getConsultAllowedOriginPatterns());

        return new AssistantIntegrationStatusView(
                externalLoginEnabled,
                loginOrigins,
                webSocketOrigins,
                externalLoginEnabled && !loginOrigins.isEmpty(),
                !webSocketOrigins.isEmpty() && !webSocketOrigins.contains(WILDCARD_ORIGIN),
                LOADER_PATH,
                EXTERNAL_LOGIN_PATH,
                CONSULT_WEBSOCKET_PATH,
                PROJECT_BINDINGS_PATH
        );
    }

    private List<String> immutable(List<String> values) {
        return values == null ? List.of() : values.stream()
                .map(String::trim)
                .filter(value -> !value.isEmpty())
                .distinct()
                .toList();
    }
}
