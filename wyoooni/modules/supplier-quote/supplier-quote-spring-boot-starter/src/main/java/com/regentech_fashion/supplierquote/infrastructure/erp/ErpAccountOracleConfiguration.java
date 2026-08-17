package com.regentech_fashion.supplierquote.infrastructure.erp;

import com.regentech_fashion.supplierquote.domain.BusinessAccountVerifier;
import com.regentech_fashion.supplierquote.config.SupplierQuoteAutoConfiguration;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;

/** 供应商报价模块的 ERP Oracle 账号只读校验装配。 */
@AutoConfiguration(before = SupplierQuoteAutoConfiguration.class)
@EnableConfigurationProperties(ErpAccountOracleProperties.class)
@ConditionalOnProperty(prefix = "regentech.supplier-quote.erp-account", name = "enabled", havingValue = "true")
public class ErpAccountOracleConfiguration {
    /** 创建独立 Oracle 账号连接。 */
    @Bean(destroyMethod = "close")
    ErpAccountOracleDatabase oracleAccountDatabase(ErpAccountOracleProperties properties) {
        return new ErpAccountOracleDatabase(properties);
    }

    /** 使用 Oracle SCM 账号覆盖默认 HTTP 账号校验器。 */
    @Bean
    BusinessAccountVerifier oracleScmBusinessAccountVerifier(ErpAccountOracleDatabase database) {
        return new OracleBusinessAccountVerifier(database.jdbc());
    }
}
