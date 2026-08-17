package com.regentech_fashion.supplierquote.service;

import com.regentech_fashion.supplierquote.api.SupplierQuoteApiException;
import com.regentech_fashion.supplierquote.api.dto.SupplierQuoteDtos.BindingView;
import com.regentech_fashion.supplierquote.api.dto.SupplierQuoteDtos.WechatSessionView;
import com.regentech_fashion.supplierquote.config.SupplierQuoteProperties;
import com.regentech_fashion.supplierquote.domain.WechatOAuthClient;
import com.regentech_fashion.supplierquote.spi.SupplierQuoteStore;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.util.Base64;
import java.util.Optional;
import java.util.UUID;

public class WechatIdentityService {
    public static final String SESSION_COOKIE = "SQ_SESSION";
    private static final Duration STATE_TTL = Duration.ofMinutes(10);
    private static final Duration SESSION_TTL = Duration.ofDays(7);

    private final SupplierQuoteStore repository;
    private final WechatOAuthClient oauthClient;
    private final SupplierQuoteProperties properties;

    public WechatIdentityService(SupplierQuoteStore repository, WechatOAuthClient oauthClient,
                                 SupplierQuoteProperties properties) {
        this.repository = repository;
        this.oauthClient = oauthClient;
        this.properties = properties;
    }

    public WechatSessionView session(String rawToken, String returnTo) {
        String safeReturnTo = safeReturnTo(returnTo);
        Optional<ResolvedSession> session = resolve(rawToken);
        if (session.isEmpty()) {
            String authorizeUrl = "/api/supplier-quote/public/wechat/oauth/authorize?returnTo="
                    + java.net.URLEncoder.encode(safeReturnTo, StandardCharsets.UTF_8);
            return new WechatSessionView(false, false, authorizeUrl, null);
        }
        BindingView binding = repository.findBindingBySubject(session.get().subjectHash()).orElse(null);
        return new WechatSessionView(true, binding != null, null, binding);
    }

    public AuthorizationStart beginAuthorization(String returnTo) {
        String state = randomToken();
        long now = System.currentTimeMillis();
        repository.saveOauthState(hash(state), safeReturnTo(returnTo), now + STATE_TTL.toMillis(), now);
        return new AuthorizationStart(state, oauthClient.isMock() ? null : oauthClient.authorizationUrl(state));
    }

    public Optional<CompletedAuthorization> beginLocalDevelopmentSession(String hostname, String returnTo) {
        if (!properties.getWechat().isLocalDevelopmentEnabled() || !isLocalDevelopmentHost(hostname)) {
            return Optional.empty();
        }
        long now = System.currentTimeMillis();
        String rawToken = randomToken();
        String subjectHash = hash(properties.getWechat().getAppId() + ":local-development");
        repository.saveSession(hash(rawToken), subjectHash, now + SESSION_TTL.toMillis(), now);
        return Optional.of(new CompletedAuthorization(rawToken, safeReturnTo(returnTo)));
    }

    @Transactional
    public CompletedAuthorization completeMock(String state) {
        if (!oauthClient.isMock()) {
            throw new SupplierQuoteApiException(HttpStatus.NOT_FOUND, "MOCK_OAUTH_DISABLED", "开发授权未启用");
        }
        return complete(state, oauthClient.mockOpenid());
    }

    @Transactional
    public CompletedAuthorization completeOfficial(String state, String code) {
        if (oauthClient.isMock()) {
            throw new SupplierQuoteApiException(HttpStatus.BAD_REQUEST, "OAUTH_MODE_MISMATCH", "当前为开发授权模式");
        }
        if (code == null || code.isBlank()) {
            throw new SupplierQuoteApiException(HttpStatus.BAD_REQUEST, "WECHAT_CODE_MISSING", "微信授权 code 缺失");
        }
        return complete(state, oauthClient.exchangeCode(code));
    }

    public Optional<ResolvedSession> resolve(String rawToken) {
        if (rawToken == null || rawToken.isBlank()) {
            return Optional.empty();
        }
        return repository.findSession(hash(rawToken), System.currentTimeMillis())
                .map(row -> new ResolvedSession(row.subjectHash(), rawToken));
    }

    public ResolvedSession requireSession(String rawToken) {
        return resolve(rawToken).orElseThrow(() -> new SupplierQuoteApiException(HttpStatus.UNAUTHORIZED,
                "WECHAT_SESSION_REQUIRED", "请先完成微信公众号静默授权"));
    }

    public boolean secureCookie() { return properties.getWechat().isSecureCookie(); }
    public int cookieMaxAgeSeconds() { return Math.toIntExact(SESSION_TTL.toSeconds()); }

    private CompletedAuthorization complete(String state, String openid) {
        if (state == null || state.isBlank()) {
            throw new SupplierQuoteApiException(HttpStatus.BAD_REQUEST, "OAUTH_STATE_MISSING", "授权 state 缺失");
        }
        long now = System.currentTimeMillis();
        String returnTo = repository.consumeOauthState(hash(state), now)
                .orElseThrow(() -> new SupplierQuoteApiException(HttpStatus.BAD_REQUEST,
                        "OAUTH_STATE_INVALID", "授权状态已过期或已使用，请重新进入报价链接"));
        String rawToken = randomToken();
        String subjectHash = hash(properties.getWechat().getAppId() + ":" + openid);
        repository.saveSession(hash(rawToken), subjectHash, now + SESSION_TTL.toMillis(), now);
        return new CompletedAuthorization(rawToken, returnTo);
    }

    public static String safeReturnTo(String returnTo) {
        if (returnTo == null || returnTo.isBlank()) {
            return "/showcase/supplier-quote/q/demo-quote";
        }
        String value = returnTo.trim();
        if (!value.startsWith("/") || value.startsWith("//") || value.contains("\\") || value.contains("\r") || value.contains("\n")) {
            throw new SupplierQuoteApiException(HttpStatus.BAD_REQUEST, "RETURN_PATH_INVALID", "返回地址必须是站内相对路径");
        }
        return value;
    }

    private static String randomToken() { return UUID.randomUUID() + "." + UUID.randomUUID(); }

    private static boolean isLocalDevelopmentHost(String hostname) {
        if (hostname == null) {
            return false;
        }
        String normalizedHostname = hostname.trim().toLowerCase(java.util.Locale.ROOT);
        return normalizedHostname.equals("localhost")
                || normalizedHostname.equals("127.0.0.1")
                || normalizedHostname.startsWith("192.168.");
    }

    private static String hash(String value) {
        try {
            byte[] bytes = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 unavailable", exception);
        }
    }

    public record AuthorizationStart(String state, String redirectUrl) {}
    public record CompletedAuthorization(String rawSessionToken, String returnTo) {}
    public record ResolvedSession(String subjectHash, String rawSessionToken) {}
}
