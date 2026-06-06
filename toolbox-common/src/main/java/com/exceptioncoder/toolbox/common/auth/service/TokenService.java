package com.exceptioncoder.toolbox.common.auth.service;

import com.exceptioncoder.toolbox.common.auth.AuthException;
import com.exceptioncoder.toolbox.common.auth.config.AuthProperties;
import com.exceptioncoder.toolbox.common.auth.domain.AuthUser;
import com.exceptioncoder.toolbox.common.auth.domain.JwtPayload;
import com.exceptioncoder.toolbox.common.auth.domain.RefreshToken;
import com.exceptioncoder.toolbox.common.auth.domain.TokenType;
import com.exceptioncoder.toolbox.common.auth.repository.RefreshTokenRepository;
import com.exceptioncoder.toolbox.common.auth.repository.TokenBlacklistRepository;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;

/**
 * 有状态 token 生命周期：refresh 落库/轮换、access 黑名单、过期惰性清理。
 */
@Service
@ConditionalOnProperty(prefix = "toolbox.auth", name = "enabled", havingValue = "true")
public class TokenService {

    private final JwtService jwtService;
    private final AuthUserService userService;
    private final RefreshTokenRepository refreshRepository;
    private final TokenBlacklistRepository blacklistRepository;
    private final AuthProperties props;

    public TokenService(JwtService jwtService,
                        AuthUserService userService,
                        RefreshTokenRepository refreshRepository,
                        TokenBlacklistRepository blacklistRepository,
                        AuthProperties props) {
        this.jwtService = jwtService;
        this.userService = userService;
        this.refreshRepository = refreshRepository;
        this.blacklistRepository = blacklistRepository;
        this.props = props;
    }

    /**
     * 登录成功后签发双 token 并落库 refresh。顺带惰性清理过期记录。
     */
    @Transactional
    public TokenPair issueFor(AuthUser user) {
        purgeExpired();
        String access = jwtService.issueAccessToken(user);
        String refresh = jwtService.issueRefreshToken(user);
        storeRefresh(user.getId(), refresh);
        return new TokenPair(access, refresh, props.getAccessTtl().toSeconds(), user);
    }

    /**
     * 刷新：校验 refresh 有效且未轮换/吊销，吊销旧值后签发新双 token（一次性 + 轮换防重放）。
     */
    @Transactional
    public TokenPair rotate(String oldRefreshToken) {
        JwtPayload payload = jwtService.parse(oldRefreshToken);
        if (payload.type() != TokenType.REFRESH) {
            throw AuthException.refreshInvalid();
        }
        RefreshToken stored = refreshRepository.findByJti(payload.jti())
                .orElseThrow(AuthException::refreshInvalid);
        if (stored.isRevoked()
                || stored.getExpiresAt() < System.currentTimeMillis()
                || !stored.getTokenHash().equals(sha256(oldRefreshToken))) {
            throw AuthException.refreshInvalid();
        }
        refreshRepository.revokeByJti(stored.getJti());

        AuthUser user = userService.getById(payload.userId());
        String access = jwtService.issueAccessToken(user);
        String refresh = jwtService.issueRefreshToken(user);
        storeRefresh(user.getId(), refresh);
        return new TokenPair(access, refresh, props.getAccessTtl().toSeconds(), user);
    }

    private void storeRefresh(long userId, String refreshToken) {
        JwtPayload payload = jwtService.parse(refreshToken);
        refreshRepository.insert(RefreshToken.builder()
                .jti(payload.jti())
                .userId(userId)
                .tokenHash(sha256(refreshToken))
                .expiresAt(payload.expiresAt())
                .revoked(false)
                .createdAt(System.currentTimeMillis())
                .build());
    }

    /**
     * 登出：拉黑当前 access（到其 exp），并吊销该用户全部 refresh，强制重新登录。
     */
    @Transactional
    public void logout(JwtPayload accessPayload) {
        blacklistRepository.add(accessPayload.jti(), accessPayload.expiresAt());
        refreshRepository.revokeAllByUser(accessPayload.userId());
    }

    public void blacklistAccess(JwtPayload accessPayload) {
        blacklistRepository.add(accessPayload.jti(), accessPayload.expiresAt());
    }

    public boolean isBlacklisted(String jti) {
        return blacklistRepository.contains(jti);
    }

    public void revokeUserRefreshTokens(long userId) {
        refreshRepository.revokeAllByUser(userId);
    }

    private void purgeExpired() {
        long now = System.currentTimeMillis();
        refreshRepository.deleteExpired(now);
        blacklistRepository.deleteExpired(now);
    }

    private static String sha256(String value) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(md.digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 不可用", e);
        }
    }
}
