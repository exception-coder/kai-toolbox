package com.exceptioncoder.toolbox.foreconsult.repository;

import com.exceptioncoder.toolbox.common.resource.ResourceCredentialCipher;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import java.util.Optional;

/** 用户系统绑定由咨询模块持有，加解密复用资源中心公共端口。 */
@Repository
public class ConsultPersonalWebRepository {
    private final JdbcTemplate jdbc;
    private final ResourceCredentialCipher cipher;
    public ConsultPersonalWebRepository(JdbcTemplate jdbc, ResourceCredentialCipher cipher) {
        this.jdbc = jdbc; this.cipher = cipher;
    }
    public record Account(String id, String owner, String sourcePath, String siteUrl, String environment,
                          String username, String passwordCipher, String loginPage, String loginStatus, long checkedAt) {
        @Override public String toString() { return "PersonalWebAccount[redacted]"; }
    }
    public Optional<Account> find(String owner, String sourcePath) {
        return jdbc.query("SELECT * FROM fore_consult_personal_web_account WHERE owner_id=? AND source_path=?",
                (rs, n) -> new Account(rs.getString("id"), rs.getString("owner_id"), rs.getString("source_path"),
                        rs.getString("site_url"), rs.getString("environment"), rs.getString("username"),
                        rs.getString("password_cipher"), rs.getString("login_page"), rs.getString("login_status"), rs.getLong("checked_at")),
                owner, sourcePath).stream().findFirst();
    }
    public String encrypt(String password) { return cipher.encrypt(password); }
    public String password(Account value) { return cipher.decrypt(value.passwordCipher()); }
    public void save(Account value) {
        jdbc.update("""
                INSERT INTO fore_consult_personal_web_account
                (id,owner_id,source_path,site_url,environment,username,password_cipher,login_page,login_status,checked_at)
                VALUES (?,?,?,?,?,?,?,?,?,?)
                ON CONFLICT(owner_id,source_path) DO UPDATE SET id=excluded.id,site_url=excluded.site_url,
                environment=excluded.environment,username=excluded.username,password_cipher=excluded.password_cipher,
                login_page=excluded.login_page,login_status=excluded.login_status,checked_at=excluded.checked_at
                """, value.id(), value.owner(), value.sourcePath(), value.siteUrl(), value.environment(), value.username(),
                value.passwordCipher(), value.loginPage(), value.loginStatus(), value.checkedAt());
    }
    public void checked(Account value, String status, long at) {
        jdbc.update("UPDATE fore_consult_personal_web_account SET login_status=?,checked_at=? WHERE id=? AND owner_id=? AND source_path=?",
                status, at, value.id(), value.owner(), value.sourcePath());
    }
    public void delete(Account value) {
        jdbc.update("DELETE FROM fore_consult_personal_web_account WHERE id=? AND owner_id=? AND source_path=?",
                value.id(), value.owner(), value.sourcePath());
    }
}
