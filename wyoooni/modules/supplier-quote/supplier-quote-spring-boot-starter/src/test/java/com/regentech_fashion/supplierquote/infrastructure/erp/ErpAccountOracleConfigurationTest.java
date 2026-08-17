package com.regentech_fashion.supplierquote.infrastructure.erp;

import com.regentech_fashion.supplierquote.domain.BusinessAccountVerifier;
import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import static org.assertj.core.api.Assertions.assertThat;

/** ERP Oracle 账号校验自动配置测试。 */
class ErpAccountOracleConfigurationTest {
    private final ApplicationContextRunner contextRunner = new ApplicationContextRunner()
            .withConfiguration(AutoConfigurations.of(ErpAccountOracleConfiguration.class))
            .withPropertyValues(
                    "regentech.supplier-quote.erp-account.enabled=true",
                    "regentech.supplier-quote.erp-account.url=jdbc:oracle:thin:@127.0.0.1:1:orcl",
                    "regentech.supplier-quote.erp-account.username=sa",
                    "regentech.supplier-quote.erp-account.password=test",
                    "regentech.supplier-quote.erp-account.minimum-idle=0",
                    "regentech.supplier-quote.erp-account.initialization-fail-timeout=-1ms");

    /** 启用 Oracle 校验时应装配数据库校验器。 */
    @Test
    void shouldCreateOracleBusinessAccountVerifierWhenEnabled() {
        contextRunner.run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(context).hasSingleBean(BusinessAccountVerifier.class);
            assertThat(context.getBean(BusinessAccountVerifier.class))
                    .isInstanceOf(OracleBusinessAccountVerifier.class);
        });
    }
}
