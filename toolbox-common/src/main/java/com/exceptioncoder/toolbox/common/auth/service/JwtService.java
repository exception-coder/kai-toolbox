package com.exceptioncoder.toolbox.common.auth.service;

import com.exceptioncoder.toolbox.common.auth.AuthException;
import com.exceptioncoder.toolbox.common.auth.config.AuthProperties;
import com.exceptioncoder.toolbox.common.auth.domain.AuthUser;
import com.exceptioncoder.toolbox.common.auth.domain.JwtPayload;
import com.exceptioncoder.toolbox.common.auth.domain.TokenType;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import jakarta.annotation.PostConstruct;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;
import java.util.List;
import java.util.UUID;

/**
 * JWT 纯算法层，无状态：HS256 签发 / 校验 / 解析。密钥从 AuthProperties 注入。
 */
@Service
@ConditionalOnProperty(prefix = "toolbox.auth", name = "enabled", havingValue = "true")
public class JwtService {

    private static final int MIN_SECRET_BYTES = 32;
    private static final String CLAIM_ROLES = "roles";
    private static final String CLAIM_PERMS = "perms";
    private static final String CLAIM_TYPE = "type";
    private static final String CLAIM_USERNAME = "username";

    private final AuthProperties props;
    private SecretKey signingKey;

    public JwtService(AuthProperties props) {
        this.props = props;
    }

    /**
     * 启动即校验密钥强度，避免运行期才暴露弱密钥。HS256 要求 >= 256 bit。
     */
    @PostConstruct
    void initKey() {
        String secret = props.getSecret();
        if (secret == null || secret.getBytes(StandardCharsets.UTF_8).length < MIN_SECRET_BYTES) {
            throw new IllegalStateException(
                    "toolbox.auth.enabled=true 但 toolbox.auth.secret 缺失或不足 32 字节，无法启动鉴权模块");
        }
        this.signingKey = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
    }

    /**
     * 签发 access token。roles + permissionCodes 由 TokenService 用 AuthoritiesResolver 解析后传入，
     * 作为登录快照写入 claim——JwtService 保持纯算法、不查库。
     */
    public String issueAccessToken(AuthUser user, List<String> roles, List<String> permissionCodes) {
        return issue(user, roles, permissionCodes, TokenType.ACCESS, props.getAccessTtl().toMillis());
    }

    /** 签发 refresh token。只需定位用户 + 角色，不携带权限码（rotate 时会重新解析快照）。 */
    public String issueRefreshToken(AuthUser user, List<String> roles) {
        return issue(user, roles, List.of(), TokenType.REFRESH, props.getRefreshTtl().toMillis());
    }

    private String issue(AuthUser user, List<String> roles, List<String> permissionCodes,
                         TokenType type, long ttlMillis) {
        long now = System.currentTimeMillis();
        return Jwts.builder()
                .subject(String.valueOf(user.getId()))
                .id(UUID.randomUUID().toString())
                .claim(CLAIM_USERNAME, user.getUsername())
                .claim(CLAIM_ROLES, roles == null ? List.of() : roles)
                .claim(CLAIM_PERMS, permissionCodes == null ? List.of() : permissionCodes)
                .claim(CLAIM_TYPE, type.name())
                .issuedAt(new Date(now))
                .expiration(new Date(now + ttlMillis))
                .signWith(signingKey)
                .compact();
    }

    /**
     * 校验签名与过期并解析。任何无效情形统一抛 AUTH_TOKEN_INVALID，不向调用方泄露细节。
     */
    @SuppressWarnings("unchecked")
    public JwtPayload parse(String token) {
        try {
            Claims claims = Jwts.parser()
                    .verifyWith(signingKey)
                    .build()
                    .parseSignedClaims(token)
                    .getPayload();
            return new JwtPayload(
                    Long.parseLong(claims.getSubject()),
                    claims.get(CLAIM_USERNAME, String.class),
                    (List<String>) claims.getOrDefault(CLAIM_ROLES, List.of()),
                    (List<String>) claims.getOrDefault(CLAIM_PERMS, List.of()),
                    claims.getId(),
                    TokenType.valueOf(claims.get(CLAIM_TYPE, String.class)),
                    claims.getExpiration().getTime()
            );
        } catch (JwtException | IllegalArgumentException e) {
            throw AuthException.tokenInvalid();
        }
    }
}
