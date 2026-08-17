package com.regentech_fashion.supplierquote.infrastructure.srm.config;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import com.regentech_fashion.supplierquote.config.SupplierQuoteAutoConfiguration;
import com.regentech_fashion.supplierquote.infrastructure.srm.JpaMarketQuoteBackend;
import com.regentech_fashion.supplierquote.infrastructure.srm.persistence.entity.MarketQuoteCycleEntity;
import com.regentech_fashion.supplierquote.infrastructure.srm.persistence.repository.MarketQuoteCycleRepository;
import com.regentech_fashion.supplierquote.infrastructure.srm.persistence.repository.MarketQuotePriceRepository;
import com.regentech_fashion.supplierquote.infrastructure.srm.persistence.repository.MarketQuoteTaskRepository;
import com.regentech_fashion.supplierquote.infrastructure.srm.persistence.repository.YarnQualityStandardRepository;
import com.regentech_fashion.supplierquote.spi.MarketQuoteBackend;
import jakarta.persistence.EntityManagerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.orm.jpa.JpaTransactionManager;
import org.springframework.orm.jpa.LocalContainerEntityManagerFactoryBean;
import org.springframework.orm.jpa.vendor.HibernateJpaVendorAdapter;
import org.springframework.transaction.PlatformTransactionManager;

import javax.sql.DataSource;

/** 市场报价 MySQL JPA 适配器的条件装配。 */
@AutoConfiguration(before = SupplierQuoteAutoConfiguration.class)
@ConditionalOnProperty(name = "regentech.supplier-quote.market-quote.provider", havingValue = "mysql")
@EnableConfigurationProperties(MarketQuoteMysqlProperties.class)
@EnableJpaRepositories(
        basePackageClasses = MarketQuoteCycleRepository.class,
        entityManagerFactoryRef = "marketQuoteEntityManagerFactory",
        transactionManagerRef = "marketQuoteTransactionManager")
public class MarketQuoteMysqlAutoConfiguration {

    /** 创建不污染宿主主数据源的 MySQL 连接池。 */
    @Bean(name = "marketQuoteDataSource", destroyMethod = "close")
    DataSource marketQuoteDataSource(MarketQuoteMysqlProperties properties) {
        validate(properties);
        HikariConfig config = new HikariConfig();
        config.setPoolName("supplier-quote-mysql");
        config.setJdbcUrl(properties.getUrl());
        config.setUsername(properties.getUsername());
        config.setPassword(properties.getPassword());
        config.setDriverClassName("com.mysql.cj.jdbc.Driver");
        config.setMaximumPoolSize(properties.getMaximumPoolSize());
        config.setMinimumIdle(properties.getMinimumIdle());
        config.setConnectionTimeout(properties.getConnectionTimeout().toMillis());
        config.setValidationTimeout(properties.getValidationTimeout().toMillis());
        config.setIdleTimeout(properties.getIdleTimeout().toMillis());
        config.setMaxLifetime(properties.getMaxLifetime().toMillis());
        config.setKeepaliveTime(properties.getKeepaliveTime().toMillis());
        return new HikariDataSource(config);
    }

    /** 创建仅扫描市场报价映射的独立 JPA Persistence Unit。 */
    @Bean(name = "marketQuoteEntityManagerFactory")
    LocalContainerEntityManagerFactoryBean marketQuoteEntityManagerFactory(
            @Qualifier("marketQuoteDataSource") DataSource dataSource) {
        HibernateJpaVendorAdapter vendorAdapter = new HibernateJpaVendorAdapter();
        vendorAdapter.setGenerateDdl(false);
        vendorAdapter.setShowSql(false);
        LocalContainerEntityManagerFactoryBean factory = new LocalContainerEntityManagerFactoryBean();
        factory.setDataSource(dataSource);
        factory.setPackagesToScan(MarketQuoteCycleEntity.class.getPackageName());
        factory.setPersistenceUnitName("marketQuoteMysql");
        factory.setJpaVendorAdapter(vendorAdapter);
        factory.setJpaPropertyMap(java.util.Map.of(
                "hibernate.hbm2ddl.auto", "validate",
                "hibernate.show_sql", "false",
                "hibernate.jdbc.time_zone", "Asia/Shanghai"));
        return factory;
    }

    /** 创建报价业务的独立事务管理器。 */
    @Bean(name = "marketQuoteTransactionManager")
    PlatformTransactionManager marketQuoteTransactionManager(
            @Qualifier("marketQuoteEntityManagerFactory") EntityManagerFactory entityManagerFactory) {
        return new JpaTransactionManager(entityManagerFactory);
    }

    /** 创建待办表的小型原子仓储。 */
    @Bean
    MarketQuoteTaskRepository marketQuoteTaskRepository() {
        return new MarketQuoteTaskRepository();
    }

    /** 使用 JPA 仓储闭环市场报价。 */
    @Bean
    MarketQuoteBackend mysqlMarketQuoteBackend(MarketQuoteCycleRepository cycles,
                                               MarketQuotePriceRepository prices,
                                               MarketQuoteTaskRepository tasks,
                                               YarnQualityStandardRepository standards) {
        return new JpaMarketQuoteBackend(cycles, prices, tasks, standards);
    }

    private static void validate(MarketQuoteMysqlProperties properties) {
        if (properties.getUrl().isBlank() || properties.getUsername().isBlank()
                || properties.getPassword().isBlank()) {
            throw new IllegalStateException("MySQL 市场报价连接配置不完整");
        }
        if (properties.getMinimumIdle() > properties.getMaximumPoolSize()) {
            throw new IllegalStateException("MySQL 连接池 minimum-idle 不能大于 maximum-pool-size");
        }
    }
}
