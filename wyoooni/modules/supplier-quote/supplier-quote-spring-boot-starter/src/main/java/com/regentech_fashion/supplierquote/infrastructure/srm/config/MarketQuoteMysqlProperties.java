package com.regentech_fashion.supplierquote.infrastructure.srm.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

/** MySQL 市场报价独立连接池配置。 */
@Getter
@Setter
@ConfigurationProperties(prefix = "regentech.supplier-quote.market-quote.mysql")
public class MarketQuoteMysqlProperties {
    private String url = "";
    private String username = "";
    private String password = "";
    private int maximumPoolSize = 10;
    private int minimumIdle = 2;
    private Duration connectionTimeout = Duration.ofSeconds(10);
    private Duration validationTimeout = Duration.ofSeconds(5);
    private Duration idleTimeout = Duration.ofMinutes(10);
    private Duration maxLifetime = Duration.ofMinutes(30);
    private Duration keepaliveTime = Duration.ofMinutes(2);
}
