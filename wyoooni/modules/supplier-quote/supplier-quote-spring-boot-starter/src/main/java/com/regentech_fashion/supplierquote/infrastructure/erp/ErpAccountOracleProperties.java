package com.regentech_fashion.supplierquote.infrastructure.erp;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

/** ERP Oracle 账号只读校验连接配置。 */
@ConfigurationProperties(prefix = "regentech.supplier-quote.erp-account")
@Getter
@Setter
public class ErpAccountOracleProperties {
    private boolean enabled;
    private String url = "";
    private String username = "";
    private String password = "";
    private int maximumPoolSize = 3;
    private int minimumIdle = 1;
    private Duration connectionTimeout = Duration.ofSeconds(10);
    private Duration validationTimeout = Duration.ofSeconds(5);
    private Duration idleTimeout = Duration.ofMinutes(5);
    private Duration maxLifetime = Duration.ofMinutes(30);
    private Duration keepaliveTime = Duration.ofMinutes(2);
    private Duration initializationFailTimeout = Duration.ofSeconds(1);

    /** 校验启用 Oracle 时所需配置。 */
    void validate() {
        requireText(url, "url");
        requireText(username, "username");
        requireText(password, "password");
        if (maximumPoolSize < 1 || minimumIdle < 0 || minimumIdle > maximumPoolSize) {
            throw new IllegalStateException("ERP account Oracle pool size configuration is invalid");
        }
        if (connectionTimeout.toMillis() < 250 || validationTimeout.toMillis() < 250) {
            throw new IllegalStateException("ERP account Oracle pool timeouts must be at least 250 ms");
        }
        if (validationTimeout.compareTo(connectionTimeout) > 0) {
            throw new IllegalStateException("ERP account Oracle validation-timeout must not exceed connection-timeout");
        }
        if (idleTimeout.toMillis() < 10_000 || maxLifetime.toMillis() < 30_000) {
            throw new IllegalStateException("ERP account Oracle lifecycle timeouts are too small");
        }
        if (!keepaliveTime.isZero() && keepaliveTime.compareTo(maxLifetime) >= 0) {
            throw new IllegalStateException("ERP account Oracle keepalive-time must be shorter than max-lifetime");
        }
    }

    private static void requireText(String value, String name) {
        if (value == null || value.isBlank()) {
            throw new IllegalStateException("ERP account Oracle " + name + " must be configured");
        }
    }
}
