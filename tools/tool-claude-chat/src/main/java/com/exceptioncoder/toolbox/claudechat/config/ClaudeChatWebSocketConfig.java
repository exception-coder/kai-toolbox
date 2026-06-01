package com.exceptioncoder.toolbox.claudechat.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;
import org.springframework.web.socket.server.standard.ServletServerContainerFactoryBean;

@Configuration
@EnableWebSocket
public class ClaudeChatWebSocketConfig implements WebSocketConfigurer {

    private final ClaudeChatWebSocketHandler handler;

    public ClaudeChatWebSocketConfig(ClaudeChatWebSocketHandler handler) {
        this.handler = handler;
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(handler, "/api/claude-chat/ws")
                .setAllowedOriginPatterns("*");
    }

    @Bean
    public ServletServerContainerFactoryBean claudeChatServletServerContainer() {
        ServletServerContainerFactoryBean f = new ServletServerContainerFactoryBean();
        // Claude 的 assistant 文本与工具结果可能较大，给到 256KB
        f.setMaxTextMessageBufferSize(256 * 1024);
        f.setMaxBinaryMessageBufferSize(256 * 1024);
        f.setMaxSessionIdleTimeout(0L);
        return f;
    }
}
