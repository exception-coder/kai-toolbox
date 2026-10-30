package com.exceptioncoder.toolbox.claudechat.service;

import static org.springframework.http.HttpStatus.*;

import com.exceptioncoder.toolbox.common.auth.config.AuthProperties;
import com.exceptioncoder.toolbox.common.auth.service.TokenService;
import com.exceptioncoder.toolbox.common.auth.web.AuthContext;
import com.exceptioncoder.toolbox.common.auth.web.AuthPrincipal;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.Objects;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

/** Short-lived, single-use, origin-bound tickets. No raw access token enters a WebSocket URL or frame. */
@Service
public class ConsultClientTickets {

    public static final String WS_PATH = "/api/fore-consult/client/ws";
    private final boolean enabled;
    private final ObjectProvider<TokenService> tokens;
    private final ObjectProvider<AuthProperties> properties;
    private final ConcurrentHashMap<String, Ticket> tickets =
        new ConcurrentHashMap<>();
    private final SecureRandom random = new SecureRandom();

    private record Ticket(AuthPrincipal principal, String origin, long until) {}

    public record Issued(String ticket, long expiresAt, String websocketPath) {}

    public ConsultClientTickets(
        @Value(
            "${toolbox.claude-chat.consult-client.enabled:false}"
        ) boolean enabled,
        ObjectProvider<TokenService> tokens,
        ObjectProvider<AuthProperties> properties
    ) {
        this.enabled = enabled;
        this.tokens = tokens;
        this.properties = properties;
    }

    public boolean enabled() {
        return enabled && tokens.getIfAvailable() != null;
    }

    public void requireEnabled() {
        if (!enabled()) {
            throw new ResponseStatusException(
                SERVICE_UNAVAILABLE,
                "业务咨询 SDK 接入尚未启用"
            );
        }
    }

    public synchronized Issued issue(String origin, String sameOrigin) {
        if (!enabled()) throw new ResponseStatusException(
            SERVICE_UNAVAILABLE,
            "业务咨询 SDK 接入尚未启用"
        );
        var principal = AuthContext.current().orElseThrow(() ->
            new ResponseStatusException(UNAUTHORIZED)
        );
        valid(principal);
        if (origin != null && !origin.equals(sameOrigin)) {
            var config = properties.getIfAvailable();
            if (
                config == null ||
                !config.getExternalLogin().isEnabled() ||
                !config.getExternalLogin().getAllowedOrigins().contains(origin)
            ) throw new ResponseStatusException(
                FORBIDDEN,
                "宿主 Origin 未配置"
            );
        }
        long now = System.currentTimeMillis();
        tickets.entrySet().removeIf(entry -> entry.getValue().until() < now);
        long own = tickets
            .values()
            .stream()
            .filter(t -> t.principal().userId() == principal.userId())
            .count();
        if (
            tickets.size() >= 1024 || own >= 8
        ) throw new ResponseStatusException(
            TOO_MANY_REQUESTS,
            "连接票据过多，请稍后重试"
        );
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        String value = Base64.getUrlEncoder()
            .withoutPadding()
            .encodeToString(bytes);
        long until = Math.min(now + 30_000, principal.expiresAt());
        tickets.put(value, new Ticket(principal, origin, until));
        return new Issued(value, until, WS_PATH);
    }

    public AuthPrincipal consume(String value, String origin) {
        if (!enabled()) throw new ResponseStatusException(SERVICE_UNAVAILABLE);
        var ticket = value == null ? null : tickets.remove(value);
        if (
            ticket == null ||
            ticket.until() < System.currentTimeMillis() ||
            !Objects.equals(ticket.origin(), origin)
        ) throw new ResponseStatusException(
            UNAUTHORIZED,
            "连接票据无效或已使用"
        );
        valid(ticket.principal());
        return ticket.principal();
    }

    public void valid(AuthPrincipal principal) {
        var service = tokens.getIfAvailable();
        if (
            service == null ||
            principal == null ||
            principal.expiresAt() <= System.currentTimeMillis() ||
            service.isBlacklisted(principal.jti())
        ) throw new ResponseStatusException(
            UNAUTHORIZED,
            "登录已失效，请重新认证"
        );
    }
}
