package com.exceptioncoder.toolbox.claudechat.config;

import com.exceptioncoder.toolbox.claudechat.service.ReviewSpaceService;
import org.springframework.http.HttpStatus;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.server.HandshakeInterceptor;
import org.springframework.web.util.UriComponentsBuilder;

import java.util.Map;

/** 评审分享链接以高熵 token 作为 capability，只放行令牌绑定的单个评审会话。 */
@Component
public class ReviewHandshakeInterceptor implements HandshakeInterceptor {
    public static final String REVIEW_SESSION_ATTRIBUTE = "reviewSessionId";
    private final ReviewSpaceService reviews;

    public ReviewHandshakeInterceptor(ReviewSpaceService reviews) {
        this.reviews = reviews;
    }

    @Override
    public boolean beforeHandshake(ServerHttpRequest request, ServerHttpResponse response,
                                   WebSocketHandler wsHandler, Map<String, Object> attributes) {
        String token = UriComponentsBuilder.fromUri(request.getURI()).build().getQueryParams().getFirst("review_token");
        return reviews.resolve(token).map(space -> {
            attributes.put(REVIEW_SESSION_ATTRIBUTE, space.reviewSessionId());
            return true;
        }).orElseGet(() -> {
            response.setStatusCode(HttpStatus.FORBIDDEN);
            return false;
        });
    }

    @Override
    public void afterHandshake(ServerHttpRequest request, ServerHttpResponse response,
                               WebSocketHandler wsHandler, Exception exception) {
    }
}
