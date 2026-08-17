package com.regentech_fashion.supplierquote.infrastructure.erp;

import com.regentech_fashion.supplierquote.api.SupplierQuoteApiException;
import com.regentech_fashion.supplierquote.domain.BusinessAccountVerifier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcOperations;

import java.util.List;
import java.util.Optional;

/** 直接读取 ERP Oracle，验证 SCM 供应商账号并转换为统一企业账号身份。 */
public final class OracleBusinessAccountVerifier implements BusinessAccountVerifier {
    private static final Logger log = LoggerFactory.getLogger(OracleBusinessAccountVerifier.class);
    private static final int ENABLED_STATUS = 1;
    private static final int EXTERNAL_ACCOUNT = 1;
    private static final String SOURCE_SYSTEM = "SCM";
    private static final String ACCOUNT_SQL = """
            SELECT u.id AS user_id,
                   u.username AS username,
                   u.password AS password_hash,
                   u.status AS user_status,
                   u.isout AS is_external,
                   s.srmid AS supplier_id,
                   s.name AS supplier_name
              FROM crm_user u
              LEFT JOIN crm_userconfig uc ON uc.userid = u.id
              LEFT JOIN erp_supplier s ON s.id = uc.wsupid
             WHERE u.username = ?
            """;

    private final JdbcOperations jdbc;
    private final LegacyScmPasswordVerifier passwordVerifier;

    public OracleBusinessAccountVerifier(JdbcOperations jdbc) {
        this(jdbc, new LegacyScmPasswordVerifier());
    }

    OracleBusinessAccountVerifier(JdbcOperations jdbc, LegacyScmPasswordVerifier passwordVerifier) {
        this.jdbc = jdbc;
        this.passwordVerifier = passwordVerifier;
    }

    @Override
    public Optional<VerifiedBusinessAccount> verify(String username, String password) {
        try {
            List<ScmAccount> accounts = jdbc.query(ACCOUNT_SQL, (resultSet, rowNumber) -> new ScmAccount(
                    resultSet.getLong("user_id"),
                    resultSet.getString("username"),
                    resultSet.getString("password_hash"),
                    resultSet.getObject("user_status", Integer.class),
                    resultSet.getObject("is_external", Integer.class),
                    resultSet.getObject("supplier_id", Long.class),
                    resultSet.getString("supplier_name")), username);
            if (accounts.size() != 1) {
                return Optional.empty();
            }
            return authenticate(accounts.getFirst(), password);
        } catch (DataAccessException exception) {
            log.error("ERP Oracle business account verification failed", exception);
            throw new SupplierQuoteApiException(HttpStatus.SERVICE_UNAVAILABLE,
                    "BUSINESS_ACCOUNT_DATABASE_UNAVAILABLE", "业务账号服务暂时不可用");
        }
    }

    private Optional<VerifiedBusinessAccount> authenticate(ScmAccount account, String password) {
        if (!Integer.valueOf(ENABLED_STATUS).equals(account.status())
                || !Integer.valueOf(EXTERNAL_ACCOUNT).equals(account.external())
                || account.supplierId() == null
                || account.supplierName() == null
                || account.supplierName().isBlank()
                || !passwordVerifier.matches(password, account.username(), account.passwordHash())) {
            return Optional.empty();
        }
        return Optional.of(new VerifiedBusinessAccount(
                Long.toString(account.userId()),
                account.username(),
                account.username(),
                Long.toString(account.supplierId()),
                account.supplierName(),
                SOURCE_SYSTEM));
    }

    /** SCM 账号及其 ERP 供应商归属的最小认证投影。 */
    record ScmAccount(
            /** CRM_USER.ID。 */ long userId,
            /** 登录名。 */ String username,
            /** 历史密码摘要。 */ String passwordHash,
            /** CRM_USER.STATUS。 */ Integer status,
            /** CRM_USER.ISOUT。 */ Integer external,
            /** ERP_SUPPLIER.SRMID。 */ Long supplierId,
            /** ERP_SUPPLIER.NAME。 */ String supplierName) {
    }
}
