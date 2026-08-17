package com.regentech_fashion.supplierquote.infrastructure.local;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.regentech_fashion.supplierquote.config.SupplierQuoteAutoConfiguration;
import com.regentech_fashion.supplierquote.service.DemoSupplierQuotationService;
import com.regentech_fashion.supplierquote.spi.SupplierQuotationUseCase;
import com.regentech_fashion.supplierquote.spi.SupplierQuoteStore;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.AutoConfigureAfter;
import org.springframework.boot.autoconfigure.AutoConfigureBefore;
import org.springframework.boot.autoconfigure.jdbc.DataSourceTransactionManagerAutoConfiguration;
import org.springframework.boot.autoconfigure.jdbc.JdbcTemplateAutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Bean;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;

/**
 * 供应商报价本地业务库默认实现，宿主可通过提供同类型 Bean 替换。
 */
@AutoConfiguration
@AutoConfigureAfter({JdbcTemplateAutoConfiguration.class, DataSourceTransactionManagerAutoConfiguration.class})
@AutoConfigureBefore(SupplierQuoteAutoConfiguration.class)
@ConditionalOnBean({JdbcTemplate.class, PlatformTransactionManager.class})
@ConditionalOnProperty(prefix = "regentech.supplier-quote.local-storage", name = "enabled", havingValue = "true")
public class LocalSupplierQuoteAutoConfiguration {

    /** 创建本地会话、绑定和报价结果存储。 */
    @Bean
    @ConditionalOnMissingBean(SupplierQuoteStore.class)
    LocalSupplierQuotePersistence localSupplierQuotePersistence(
            JdbcTemplate jdbcTemplate,
            @Qualifier("transactionManager") PlatformTransactionManager transactionManager) {
        return new JdbcLocalSupplierQuoteStore(jdbcTemplate, transactionManager);
    }

    /** 创建用于开发验证的报价用例，生产宿主可提供真实实现替换。 */
    @Bean
    @ConditionalOnMissingBean(SupplierQuotationUseCase.class)
    SupplierQuotationUseCase demoSupplierQuotationUseCase(
            LocalSupplierQuotePersistence persistence,
            ObjectMapper objectMapper) {
        return new DemoSupplierQuotationService(persistence, objectMapper);
    }
}
