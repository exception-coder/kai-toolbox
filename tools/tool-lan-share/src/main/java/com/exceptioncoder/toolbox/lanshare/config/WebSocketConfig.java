package com.exceptioncoder.toolbox.lanshare.config;

import com.exceptioncoder.toolbox.lanshare.service.SignalingWebSocketHandler;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

@Configuration
@EnableWebSocket
@RequiredArgsConstructor
public class WebSocketConfig implements WebSocketConfigurer {

    private final SignalingWebSocketHandler signalingHandler;

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        // 走 /api 前缀，沿用 vite proxy；浏览器原生 WebSocket
        registry.addHandler(signalingHandler, "/api/lan-share/signaling")
                .setAllowedOriginPatterns("*");
    }
}
