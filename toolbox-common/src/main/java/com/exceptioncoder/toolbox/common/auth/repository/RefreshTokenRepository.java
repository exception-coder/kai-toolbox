package com.exceptioncoder.toolbox.common.auth.repository;

import com.exceptioncoder.toolbox.common.auth.domain.RefreshToken;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.util.Optional;

/**
 * auth_refresh_token 表读写。支持轮换（revoke 旧值）与按用户批量吊销。
 */
@Repository
@ConditionalOnProperty(prefix = "toolbox.auth", name = "enabled", havingValue = "true")
public class RefreshTokenRepository {

    private final JdbcTemplate jdbc;

    public RefreshTokenRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    private static final RowMapper<RefreshToken> ROW = (rs, i) -> RefreshToken.builder()
            .jti(rs.getString("jti"))
            .userId(rs.getLong("user_id"))
            .tokenHash(rs.getString("token_hash"))
            .expiresAt(rs.getLong("expires_at"))
            .revoked(rs.getInt("revoked") == 1)
            .createdAt(rs.getLong("created_at"))
            .build();

    public void insert(RefreshToken token) {
        jdbc.update("INSERT INTO auth_refresh_token (jti, user_id, token_hash, expires_at, revoked, created_at) "
                        + "VALUES (?, ?, ?, ?, ?, ?)",
                token.getJti(), token.getUserId(), token.getTokenHash(),
                token.getExpiresAt(), token.isRevoked() ? 1 : 0, token.getCreatedAt());
    }

    public Optional<RefreshToken> findByJti(String jti) {
        return jdbc.query("SELECT * FROM auth_refresh_token WHERE jti = ?", ROW, jti)
                .stream().findFirst();
    }

    public void revokeByJti(String jti) {
        jdbc.update("UPDATE auth_refresh_token SET revoked = 1 WHERE jti = ?", jti);
    }

    public void revokeAllByUser(long userId) {
        jdbc.update("UPDATE auth_refresh_token SET revoked = 1 WHERE user_id = ?", userId);
    }

    public void deleteExpired(long now) {
        jdbc.update("DELETE FROM auth_refresh_token WHERE expires_at < ?", now);
    }
}
