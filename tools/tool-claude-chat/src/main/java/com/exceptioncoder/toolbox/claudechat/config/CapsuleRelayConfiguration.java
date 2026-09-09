package com.exceptioncoder.toolbox.claudechat.config;

import com.exceptioncoder.toolbox.claudechat.service.CapsuleRelayIdentityService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;

@Configuration(proxyBeanMethods = false)
@ConditionalOnProperty(prefix = "toolbox.auth", name = "enabled", havingValue = "true")
public class CapsuleRelayConfiguration {
    @Bean
    WebSocketConfigurer capsuleRelaySockets(CapsuleRelayIdentityService identities, ClaudeChatWebSocketHandler handler,
            ObjectMapper mapper) {
        var gateway = new CapsuleRelayGateway(identities, handler, mapper);
        return registry -> registry.addHandler(gateway, CapsuleRelayGateway.PATH).addInterceptors(gateway);
    }
}
