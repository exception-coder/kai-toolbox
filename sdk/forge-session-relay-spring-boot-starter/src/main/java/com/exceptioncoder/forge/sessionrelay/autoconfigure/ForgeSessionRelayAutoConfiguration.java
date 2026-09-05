package com.exceptioncoder.forge.sessionrelay.autoconfigure;

import com.exceptioncoder.forge.sessionrelay.ForgeRelayBindingStore;
import com.exceptioncoder.forge.sessionrelay.ForgeRelayParticipantResolver;
import com.exceptioncoder.forge.sessionrelay.support.ForgeRelayUpstreamClient;
import com.exceptioncoder.forge.sessionrelay.support.InMemoryForgeRelayBindingStore;
import com.exceptioncoder.forge.sessionrelay.support.LocalConnectionTicketStore;
import com.exceptioncoder.forge.sessionrelay.web.ForgeRelayHandshakeInterceptor;
import com.exceptioncoder.forge.sessionrelay.web.ForgeRelayWebSocketHandler;
import com.exceptioncoder.forge.sessionrelay.web.ForgeSessionRelayController;
import com.exceptioncoder.forge.sessionrelay.web.ForgeSessionRelayExceptionHandler;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.web.client.RestClient;
import org.springframework.web.socket.client.standard.StandardWebSocketClient;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;

/** 按显式开关和宿主身份解析器装配 Session Relay。 */
@AutoConfiguration
@ConditionalOnClass(WebSocketConfigurer.class)
@ConditionalOnProperty(prefix = "forge.session-relay", name = "enabled", havingValue = "true")
@ConditionalOnBean(ForgeRelayParticipantResolver.class)
@EnableConfigurationProperties(ForgeSessionRelayProperties.class)
public class ForgeSessionRelayAutoConfiguration {

    @Bean
    @ConditionalOnMissingBean
    ForgeRelayBindingStore forgeRelayBindingStore(ForgeSessionRelayProperties properties) {
        return new InMemoryForgeRelayBindingStore(properties.getMaxBindings());
    }

    @Bean
    LocalConnectionTicketStore forgeRelayTicketStore(ForgeSessionRelayProperties properties) {
        return new LocalConnectionTicketStore(properties.getLocalTicketTtl());
    }

    @Bean
    ForgeRelayUpstreamClient forgeRelayUpstreamClient(ForgeSessionRelayProperties properties,
                                                       ObjectProvider<RestClient.Builder> builders) {
        requireConfiguration(properties);
        return new ForgeRelayUpstreamClient(properties, builders.getIfAvailable(RestClient::builder));
    }

    @Bean
    ForgeSessionRelayController forgeSessionRelayController(ForgeRelayParticipantResolver resolver,
                                                             ForgeRelayBindingStore store,
                                                             LocalConnectionTicketStore tickets,
                                                             ForgeRelayUpstreamClient upstream) {
        return new ForgeSessionRelayController(resolver, store, tickets, upstream);
    }

    @Bean
    ForgeSessionRelayExceptionHandler forgeSessionRelayExceptionHandler() {
        return new ForgeSessionRelayExceptionHandler();
    }

    @Configuration(proxyBeanMethods = false)
    @EnableWebSocket
    static class RelayWebSocketConfiguration {
        @Bean
        StandardWebSocketClient forgeRelayWebSocketClient() { return new StandardWebSocketClient(); }

        @Bean
        WebSocketConfigurer forgeRelayWebSocketConfigurer(ForgeRelayParticipantResolver resolver,
                                                           LocalConnectionTicketStore tickets,
                                                           ForgeRelayUpstreamClient upstream,
                                                           ForgeSessionRelayProperties properties,
                                                           StandardWebSocketClient client) {
            return registry -> registry.addHandler(new ForgeRelayWebSocketHandler(upstream, properties, client),
                            properties.getApiPath() + "/ws")
                    .addInterceptors(new ForgeRelayHandshakeInterceptor(resolver, tickets))
                    .setAllowedOriginPatterns();
        }
    }

    private static void requireConfiguration(ForgeSessionRelayProperties properties) {
        if (properties.getForgeBaseUrl().isBlank() || properties.getClientId().isBlank()
                || properties.getClientSecret().isBlank()) {
            throw new IllegalStateException("forge.session-relay 已启用，但 Forge 地址或 Relay 凭据不完整");
        }
        if (properties.getMaxBindings() <= 0 || properties.getMaxPendingFrames() <= 0
                || properties.getMaxFrameBytes() <= 0 || properties.getLocalTicketTtl().isNegative()
                || properties.getLocalTicketTtl().isZero()) {
            throw new IllegalStateException("forge.session-relay 资源上限必须为正数");
        }
    }
}
