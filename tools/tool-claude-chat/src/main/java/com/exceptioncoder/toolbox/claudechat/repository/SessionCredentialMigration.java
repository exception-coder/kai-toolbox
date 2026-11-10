package com.exceptioncoder.toolbox.claudechat.repository;

import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

/** 启动时把历史明文保存的会话网关凭据改为密文；幂等，已加密的行不再处理。 */
@Slf4j
@Component
public class SessionCredentialMigration implements ApplicationRunner {

    private final JdbcTemplate jdbc;
    private final SessionCredentialCipher credentials;

    public SessionCredentialMigration(JdbcTemplate jdbc, SessionCredentialCipher credentials) {
        this.jdbc = jdbc;
        this.credentials = credentials;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            log.info("[claude-chat] 会话网关凭据加密迁移完成：{} 条", encryptPlaintextTokens());
        } catch (Exception e) {
            // 迁移失败不阻断启动；读取仍兼容明文，下次启动重试。
            log.warn("[claude-chat] 会话网关凭据加密迁移未完成：{}", e.getMessage());
        }
    }

    int encryptPlaintextTokens() {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT id, auth_token FROM claude_chat_session WHERE auth_token IS NOT NULL AND auth_token <> '' AND auth_token NOT LIKE ?",
                SessionCredentialCipher.PREFIX + "%");
        int migrated = 0;
        for (Map<String, Object> row : rows) {
            String plain = (String) row.get("auth_token");
            // 以原值为条件更新，避免与并发写入互相覆盖。
            migrated += jdbc.update("UPDATE claude_chat_session SET auth_token = ? WHERE id = ? AND auth_token = ?",
                    credentials.encrypt(plain), row.get("id"), plain);
        }
        return migrated;
    }
}
