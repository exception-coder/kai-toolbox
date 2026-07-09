package com.exceptioncoder.toolbox.claudechat.config;

import com.exceptioncoder.toolbox.common.auth.web.AdminHandshakeInterceptor;
import org.springframework.beans.factory.ObjectProvider;
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
    private final DemoWebSocketHandler demoHandler;
    private final ObjectProvider<AdminHandshakeInterceptor> adminHandshake;
    private final ClaudeChatProperties props;

    public ClaudeChatWebSocketConfig(ClaudeChatWebSocketHandler handler,
                                     DemoWebSocketHandler demoHandler,
                                     ObjectProvider<AdminHandshakeInterceptor> adminHandshake,
                                     ClaudeChatProperties props) {
        this.handler = handler;
        this.demoHandler = demoHandler;
        this.adminHandshake = adminHandshake;
        this.props = props;
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        var registration = registry.addHandler(handler, "/api/claude-chat/ws")
                .setAllowedOriginPatterns("*");
        // 鉴权开启时（AdminHandshakeInterceptor 存在）才在握手阶段校验 ADMIN；关闭时不拦。
        AdminHandshakeInterceptor interceptor = adminHandshake.getIfAvailable();
        if (interceptor != null) {
            registration.addInterceptors(interceptor);
        }
        // 福利签收演示通道：公开免登录，**不挂** Admin 拦截器；约束由副本沙箱 + canUseTool 硬保证。
        registry.addHandler(demoHandler, "/api/claude-chat/demo/ws")
                .setAllowedOriginPatterns("*");
    }

    @Bean
    public ServletServerContainerFactoryBean claudeChatServletServerContainer() {
        ServletServerContainerFactoryBean f = new ServletServerContainerFactoryBean();
        // 单条大消息（Write 大文件的 permissionRequest 带整份内容、大 toolResult 等）会超默认上限被以 1009
        // 关连、确认丢失静默失败；调到可配置的大值（默认 8MB），覆盖常见源码文件。
        int max = props.getWsMaxMessageBytes();
        f.setMaxTextMessageBufferSize(max);
        f.setMaxBinaryMessageBufferSize(max);
        f.setMaxSessionIdleTimeout(0L);
        return f;
    }
}
