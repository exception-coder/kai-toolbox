package com.exceptioncoder.toolbox.common.auth.repository;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * auth_token_blacklist 表读写。登出/吊销的 access jti 写入，过滤器校验时查。
 * 只保留到 token 自身 exp，过期后由 deleteExpired 清理。
 */
@Repository
@ConditionalOnProperty(prefix = "toolbox.auth", name = "enabled", havingValue = "true")
public class TokenBlacklistRepository {

    private final JdbcTemplate jdbc;

    public TokenBlacklistRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void add(String jti, long expiresAt) {
        jdbc.update("INSERT INTO auth_token_blacklist (jti, expires_at) VALUES (?, ?) "
                + "ON CONFLICT(jti) DO UPDATE SET expires_at = excluded.expires_at", jti, expiresAt);
    }

    public boolean contains(String jti) {
        Integer cnt = jdbc.queryForObject(
                "SELECT COUNT(1) FROM auth_token_blacklist WHERE jti = ?", Integer.class, jti);
        return cnt != null && cnt > 0;
    }

    public void deleteExpired(long now) {
        jdbc.update("DELETE FROM auth_token_blacklist WHERE expires_at < ?", now);
    }
}
