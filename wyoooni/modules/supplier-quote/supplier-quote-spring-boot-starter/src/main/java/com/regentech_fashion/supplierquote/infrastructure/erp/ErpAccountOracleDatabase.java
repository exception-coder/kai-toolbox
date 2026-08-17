package com.regentech_fashion.supplierquote.infrastructure.erp;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import org.springframework.jdbc.core.JdbcTemplate;

/** 与 H5 主数据源隔离的 ERP Oracle 只读账号连接。 */
final class ErpAccountOracleDatabase implements AutoCloseable {
    private final HikariDataSource dataSource;
    private final JdbcTemplate jdbc;

    ErpAccountOracleDatabase(ErpAccountOracleProperties properties) {
        properties.validate();
        HikariConfig config = new HikariConfig();
        config.setPoolName("supplier-quote-erp-account");
        config.setDriverClassName("oracle.jdbc.OracleDriver");
        config.setJdbcUrl(properties.getUrl());
        config.setUsername(properties.getUsername());
        config.setPassword(properties.getPassword());
        config.setMaximumPoolSize(properties.getMaximumPoolSize());
        config.setMinimumIdle(properties.getMinimumIdle());
        config.setConnectionTimeout(properties.getConnectionTimeout().toMillis());
        config.setValidationTimeout(properties.getValidationTimeout().toMillis());
        config.setIdleTimeout(properties.getIdleTimeout().toMillis());
        config.setMaxLifetime(properties.getMaxLifetime().toMillis());
        config.setKeepaliveTime(properties.getKeepaliveTime().toMillis());
        config.setReadOnly(true);
        config.setInitializationFailTimeout(properties.getInitializationFailTimeout().toMillis());
        dataSource = new HikariDataSource(config);
        jdbc = new JdbcTemplate(dataSource);
    }

    JdbcTemplate jdbc() { return jdbc; }

    @Override
    public void close() { dataSource.close(); }
}
