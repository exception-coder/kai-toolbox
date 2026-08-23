package com.regentech_fashion.supplierquote.infrastructure.srm.config;

import com.zaxxer.hikari.HikariDataSource;
import org.junit.jupiter.api.Test;
import org.springframework.orm.jpa.LocalContainerEntityManagerFactoryBean;

import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatNoException;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** 验证市场报价 MySQL 基础设施的离线启动边界。 */
class MarketQuoteMysqlAutoConfigurationTest {

    private static final String UNAVAILABLE_JDBC_URL =
            "jdbc:mysql://127.0.0.1:1/supplier_quote?connectTimeout=100&socketTimeout=100";

    @Test
    void startsJpaInfrastructureWhenMysqlIsUnavailable() {
        MarketQuoteMysqlProperties properties = unavailableMysqlProperties();
        MarketQuoteMysqlAutoConfiguration configuration = new MarketQuoteMysqlAutoConfiguration();

        try (HikariDataSource dataSource =
                     (HikariDataSource) configuration.marketQuoteDataSource(properties)) {
            assertThat(dataSource.getInitializationFailTimeout()).isNegative();

            LocalContainerEntityManagerFactoryBean entityManagerFactory =
                    configuration.marketQuoteEntityManagerFactory(dataSource);
            try {
                assertThatNoException().isThrownBy(entityManagerFactory::afterPropertiesSet);
                assertThatThrownBy(dataSource::getConnection)
                        .hasMessageContaining("Connection is not available");
            } finally {
                entityManagerFactory.destroy();
            }
        }
    }

    private static MarketQuoteMysqlProperties unavailableMysqlProperties() {
        MarketQuoteMysqlProperties properties = new MarketQuoteMysqlProperties();
        properties.setUrl(UNAVAILABLE_JDBC_URL);
        properties.setUsername("test");
        properties.setPassword("test");
        properties.setMinimumIdle(0);
        properties.setConnectionTimeout(Duration.ofMillis(250));
        properties.setValidationTimeout(Duration.ofMillis(250));
        return properties;
    }
}
