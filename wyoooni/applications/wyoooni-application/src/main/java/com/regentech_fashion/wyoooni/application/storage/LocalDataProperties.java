package com.regentech_fashion.wyoooni.application.storage;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

/** Wyoooni H5 本地 SQLite 文件配置。 */
@ConfigurationProperties(prefix = "regentech.wyoooni.local-data")
@Getter
@Setter
public class LocalDataProperties {
    private String file = "wyoooni.db";
    private int maximumPoolSize = 4;
    private int minimumIdle = 1;
    private Duration connectionTimeout = Duration.ofSeconds(10);
    private Duration validationTimeout = Duration.ofSeconds(5);

    /** 校验SQLite连接池边界。 */
    void validate() {
        if (maximumPoolSize < 1 || minimumIdle < 0 || minimumIdle > maximumPoolSize) {
            throw new IllegalStateException("Wyoooni SQLite pool size configuration is invalid");
        }
        if (connectionTimeout.toMillis() < 250 || validationTimeout.toMillis() < 250) {
            throw new IllegalStateException("Wyoooni SQLite pool timeouts must be at least 250 ms");
        }
        if (validationTimeout.compareTo(connectionTimeout) > 0) {
            throw new IllegalStateException("Wyoooni SQLite validation-timeout must not exceed connection-timeout");
        }
    }
}
