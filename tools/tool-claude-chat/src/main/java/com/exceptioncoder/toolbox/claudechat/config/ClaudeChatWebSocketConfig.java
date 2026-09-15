package com.exceptioncoder.toolbox.claudechat.config;

import com.exceptioncoder.toolbox.common.auth.web.AdminHandshakeInterceptor;
import com.exceptioncoder.toolbox.common.auth.web.AuthenticatedHandshakeInterceptor;
import com.exceptioncoder.toolbox.common.auth.web.PrdDevelopmentHandshakeInterceptor;
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
    private final ObjectProvider<AuthenticatedHandshakeInterceptor> authenticatedHandshake;
    private final ObjectProvider<PrdDevelopmentHandshakeInterceptor> prdDevelopmentHandshake;
    private final ClaudeChatWsProperties wsProps;
    private final ReviewHandshakeInterceptor reviewHandshake;

    public ClaudeChatWebSocketConfig(ClaudeChatWebSocketHandler handler,
                                     DemoWebSocketHandler demoHandler,
                                     ObjectProvider<AdminHandshakeInterceptor> adminHandshake,
                                     ObjectProvider<AuthenticatedHandshakeInterceptor> authenticatedHandshake,
                                     ObjectProvider<PrdDevelopmentHandshakeInterceptor> prdDevelopmentHandshake,
                                     ClaudeChatWsProperties wsProps,
                                     ReviewHandshakeInterceptor reviewHandshake) {
        this.handler = handler;
        this.demoHandler = demoHandler;
        this.adminHandshake = adminHandshake;
        this.authenticatedHandshake = authenticatedHandshake;
        this.prdDevelopmentHandshake = prdDevelopmentHandshake;
        this.wsProps = wsProps;
        this.reviewHandshake = reviewHandshake;
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
        // 需求中枢代码节点专用入口：普通账号只在自己负责的 PRD 范围内放行，ADMIN 仍可直接使用。
        var prdDevRegistration = registry.addHandler(handler, "/api/claude-chat/prd-dev/ws")
                .setAllowedOriginPatterns("*");
        PrdDevelopmentHandshakeInterceptor prdDevInterceptor = prdDevelopmentHandshake.getIfAvailable();
        if (prdDevInterceptor != null) {
            prdDevRegistration.addInterceptors(prdDevInterceptor);
        }
        // 业务咨询复用会话引擎，但面向普通登录用户；使用独立入口，避免放宽 Vibe Coding 的 ADMIN 门禁。
        var consultRegistration = registry.addHandler(handler, "/api/claude-chat/consult/ws")
                .setAllowedOriginPatterns(wsProps.getConsultAllowedOriginPatterns().toArray(String[]::new));
        AuthenticatedHandshakeInterceptor consultInterceptor = authenticatedHandshake.getIfAvailable();
        if (consultInterceptor != null) {
            consultRegistration.addInterceptors(consultInterceptor);
        }
        // 福利签收演示通道：公开免登录，**不挂** Admin 拦截器；约束由副本沙箱 + canUseTool 硬保证。
        registry.addHandler(demoHandler, "/api/claude-chat/demo/ws")
                .setAllowedOriginPatterns("*");
        registry.addHandler(handler, "/api/claude-chat/review/ws")
                .setAllowedOriginPatterns("*")
                .addInterceptors(reviewHandshake);
    }

    @Bean
    public ServletServerContainerFactoryBean claudeChatServletServerContainer() {
        ServletServerContainerFactoryBean f = new ServletServerContainerFactoryBean();
        // 单条大消息（Write 大文件的 permissionRequest 带整份内容、大 toolResult 等）会超默认上限被以 1009
        // 关连、确认丢失静默失败；调到可配置的大值（默认 8MB），覆盖常见源码文件。
        int max = wsProps.getMaxMessageBytes();
        f.setMaxTextMessageBufferSize(max);
        f.setMaxBinaryMessageBufferSize(max);
        f.setMaxSessionIdleTimeout(0L);
        return f;
    }
}
