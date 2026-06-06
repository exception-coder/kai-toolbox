package com.exceptioncoder.toolbox.webterm.config;

import com.exceptioncoder.toolbox.common.auth.web.AdminHandshakeInterceptor;
import com.exceptioncoder.toolbox.webterm.handler.WebTermSocketHandler;
import org.springframework.beans.factory.ObjectProvider;
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
    private final ObjectProvider<AdminHandshakeInterceptor> adminHandshake;

    public WebTermWebSocketConfig(WebTermSocketHandler handler,
                                  ObjectProvider<AdminHandshakeInterceptor> adminHandshake) {
        this.handler = handler;
        this.adminHandshake = adminHandshake;
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        var registration = registry.addHandler(handler, "/api/webterm/ws")
                .setAllowedOriginPatterns("*");
        // 鉴权开启时（AdminHandshakeInterceptor 存在）才在握手阶段校验 ADMIN；关闭时不拦。
        AdminHandshakeInterceptor interceptor = adminHandshake.getIfAvailable();
        if (interceptor != null) {
            registration.addInterceptors(interceptor);
        }
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
