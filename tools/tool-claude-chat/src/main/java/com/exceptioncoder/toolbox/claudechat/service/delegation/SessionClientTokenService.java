package com.exceptioncoder.toolbox.claudechat.service.delegation;

import com.exceptioncoder.toolbox.claudechat.domain.delegation.SessionAccessGrant;
import com.exceptioncoder.toolbox.claudechat.domain.delegation.SessionClientErrorCode;
import com.exceptioncoder.toolbox.claudechat.domain.delegation.SessionClientPrincipal;
import com.exceptioncoder.toolbox.claudechat.domain.delegation.SessionGrantException;
import com.exceptioncoder.toolbox.common.auth.config.AuthProperties;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import jakarta.annotation.PostConstruct;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.time.Instant;
import java.util.Date;
import java.util.UUID;

/** 签发和校验只面向 Session Client 资源服务器的短期访问令牌。 */
@Service
@ConditionalOnProperty(prefix = "toolbox.auth", name = "enabled", havingValue = "true")
public class SessionClientTokenService {

    private static final String AUDIENCE = "session-client";
    private static final String TOKEN_KIND = "session_client_access";
    private static final String CLAIM_AUDIENCE = "aud";
    private static final String CLAIM_KIND = "kind";
    private static final String CLAIM_GRANT_ID = "grant_id";
    private static final String CLAIM_SESSION_ID = "session_id";
    private static final Duration TOKEN_TTL = Duration.ofMinutes(30);

    private final AuthProperties properties;
    private SecretKey signingKey;

    public SessionClientTokenService(AuthProperties properties) {
        this.properties = properties;
    }

    /** 为公共会话令牌派生独立签名域，避免其被普通 Forge JWT 接受。 */
    @PostConstruct
    void initializeKey() {
        try {
            byte[] derived = MessageDigest.getInstance("SHA-256")
                    .digest((properties.getSecret() + ":session-client-token:v1")
                            .getBytes(StandardCharsets.UTF_8));
            signingKey = Keys.hmacShaKeyFor(derived);
        } catch (NoSuchAlgorithmException error) {
            throw new IllegalStateException("SHA-256 不可用", error);
        }
    }

    /**
     * 为已完成邀请配对的授权签发短期访问令牌。
     *
     * @param grant 有效授权
     * @param now 当前时间
     * @return 访问令牌及其绝对失效时间
     */
    public IssuedToken issue(SessionAccessGrant grant, Instant now) {
        return issue(grant, now, min(now.plus(TOKEN_TTL), grant.expiresAt()));
    }

    /** 为受信业务服务签发不超过 Grant 生命周期的服务端专用访问令牌。 */
    public IssuedToken issueForRelay(SessionAccessGrant grant, Instant now) {
        return issue(grant, now, grant.expiresAt());
    }

    private IssuedToken issue(SessionAccessGrant grant, Instant now, Instant expiresAt) {
        grant.requireAccess(grant.subjectUserId(), grant.sessionId(), now);
        String tokenId = UUID.randomUUID().toString();
        String token = Jwts.builder()
                .subject(String.valueOf(grant.subjectUserId()))
                .id(tokenId)
                .claim(CLAIM_AUDIENCE, AUDIENCE)
                .claim(CLAIM_KIND, TOKEN_KIND)
                .claim(CLAIM_GRANT_ID, grant.id())
                .claim(CLAIM_SESSION_ID, grant.sessionId())
                .issuedAt(Date.from(now))
                .expiration(Date.from(expiresAt))
                .signWith(signingKey)
                .compact();
        return new IssuedToken(token, expiresAt);
    }

    /**
     * 校验签名、有效期、受众和会话限定声明。
     *
     * @param token Bearer token
     * @return 已校验身份
     */
    public SessionClientPrincipal parse(String token) {
        try {
            Claims claims = Jwts.parser().verifyWith(signingKey).build()
                    .parseSignedClaims(token).getPayload();
            if (claims.getAudience() == null || !claims.getAudience().contains(AUDIENCE)
                    || !TOKEN_KIND.equals(claims.get(CLAIM_KIND, String.class))) {
                throw invalidToken();
            }
            String grantId = claims.get(CLAIM_GRANT_ID, String.class);
            String sessionId = claims.get(CLAIM_SESSION_ID, String.class);
            if (grantId == null || sessionId == null || claims.getId() == null) {
                throw invalidToken();
            }
            return new SessionClientPrincipal(Long.parseLong(claims.getSubject()), grantId, sessionId,
                    claims.getId(), claims.getExpiration().toInstant());
        } catch (JwtException | IllegalArgumentException error) {
            throw invalidToken();
        }
    }

    private static Instant min(Instant left, Instant right) {
        return left.isBefore(right) ? left : right;
    }

    private static SessionGrantException invalidToken() {
        return new SessionGrantException(SessionClientErrorCode.AUTHENTICATION_REQUIRED,
                "Session Client 访问令牌无效或已过期");
    }

    /**
     * 新签发访问令牌。
     *
     * @param accessToken Bearer token
     * @param expiresAt 绝对失效时间
     */
    public record IssuedToken(String accessToken, Instant expiresAt) {
    }
}
