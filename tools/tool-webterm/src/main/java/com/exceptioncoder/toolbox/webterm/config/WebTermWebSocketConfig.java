package com.exceptioncoder.toolbox.webterm.config;

import com.exceptioncoder.toolbox.webterm.handler.WebTermSocketHandler;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;
import org.springframework.web.socket.server.standard.ServletServerContainerFactoryBean;

@Configuration
@EnableWebSocket
public class WebTermWebSocketConfig implements WebSocketConfigurer {

    private final WebTermSocketHandler handler;

    public WebTermWebSocketConfig(WebTermSocketHandler handler) {
        this.handler = handler;
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(handler, "/api/webterm/ws")
                .setAllowedOriginPatterns("*");
    }

    @Bean
    public ServletServerContainerFactoryBean webTermServletServerContainer() {
        ServletServerContainerFactoryBean f = new ServletServerContainerFactoryBean();
        f.setMaxTextMessageBufferSize(64 * 1024);
        f.setMaxBinaryMessageBufferSize(64 * 1024);
        f.setMaxSessionIdleTimeout(0L);
        return f;
    }
}
