package com.exceptioncoder.toolbox.common.auth.web;

import com.exceptioncoder.toolbox.common.auth.AuthException;
import com.exceptioncoder.toolbox.common.auth.config.AuthProperties;
import com.exceptioncoder.toolbox.common.auth.domain.JwtPayload;
import com.exceptioncoder.toolbox.common.auth.domain.TokenType;
import com.exceptioncoder.toolbox.common.auth.service.JwtService;
import com.exceptioncoder.toolbox.common.auth.service.TokenService;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.util.AntPathMatcher;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.time.Instant;
import java.util.Map;

/**
 * 认证过滤器（MVC 之前）。职责仅「认证」（你是谁），不做「授权」（能不能访问）——授权交给
 * RequireAuthInterceptor。
 *
 * <p>策略：携带 token 时尽力解析并写入 AuthContext（使方法级 {@code @RequireAuth} 在任意路径可用）；
 * 只有命中 protected-patterns 的路径才在缺 token / token 无效时直接 401 拦截。
 */
public class JwtAuthFilter extends OncePerRequestFilter {

    private static final String BEARER_PREFIX = "Bearer ";

    private final JwtService jwtService;
    private final TokenService tokenService;
    private final AuthProperties props;
    private final ObjectMapper objectMapper;
    private final AntPathMatcher pathMatcher = new AntPathMatcher();

    public JwtAuthFilter(JwtService jwtService, TokenService tokenService,
                         AuthProperties props, ObjectMapper objectMapper) {
        this.jwtService = jwtService;
        this.tokenService = tokenService;
        this.props = props;
        this.objectMapper = objectMapper;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {
        boolean protectedPath = requiresAuth(request.getRequestURI());
        String token = extractToken(request);

        if (token != null) {
            try {
                authenticate(token);
            } catch (AuthException e) {
                // 受保护路径上 token 无效 → 拒绝；非受保护路径忽略，按匿名继续。
                if (protectedPath) {
                    writeError(response, e);
                    return;
                }
            }
        } else if (protectedPath) {
            writeError(response, AuthException.tokenInvalid());
            return;
        }

        try {
            chain.doFilter(request, response);
        } finally {
            AuthContext.clear();
        }
    }

    private void authenticate(String token) {
        JwtPayload payload = jwtService.parse(token);
        if (payload.type() != TokenType.ACCESS) {
            throw AuthException.tokenInvalid();
        }
        if (tokenService.isBlacklisted(payload.jti())) {
            throw AuthException.tokenInvalid();
        }
        AuthContext.set(new AuthPrincipal(
                payload.userId(), payload.username(), payload.roles(), payload.permissionCodes(),
                payload.jti(), payload.expiresAt()));
    }

    private boolean requiresAuth(String uri) {
        for (String white : props.getWhitelist()) {
            if (pathMatcher.match(white, uri)) {
                return false;
            }
        }
        for (String pattern : props.getProtectedPatterns()) {
            if (pathMatcher.match(pattern, uri)) {
                return true;
            }
        }
        return false;
    }

    /**
     * 取 token：优先 {@code Authorization: Bearer}；其次 {@code access_token} 查询参数。
     * 后者用于浏览器原生媒体请求（{@code <video>} / hls.js / {@code <img>} / {@code <track>}）——
     * 这些请求无法自定义请求头，只能把 token 放 query。
     */
    private String extractToken(HttpServletRequest request) {
        String header = request.getHeader(HttpHeaders.AUTHORIZATION);
        if (header != null && header.startsWith(BEARER_PREFIX)) {
            return header.substring(BEARER_PREFIX.length()).trim();
        }
        String queryToken = request.getParameter("access_token");
        if (queryToken != null && !queryToken.isBlank()) {
            return queryToken.trim();
        }
        return null;
    }

    private void writeError(HttpServletResponse response, AuthException e) throws IOException {
        response.setStatus(e.getStatus().value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding("UTF-8");
        objectMapper.writeValue(response.getWriter(), Map.of(
                "timestamp", Instant.now().toString(),
                "status", e.getStatus().value(),
                "error", e.getStatus().getReasonPhrase(),
                "code", e.getCode(),
                "message", e.getMessage()
        ));
    }
}
