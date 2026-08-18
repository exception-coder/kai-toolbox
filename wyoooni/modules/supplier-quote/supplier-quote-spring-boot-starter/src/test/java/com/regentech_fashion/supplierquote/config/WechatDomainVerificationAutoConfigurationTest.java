package com.regentech_fashion.supplierquote.config;

import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import static org.assertj.core.api.Assertions.assertThat;

class WechatDomainVerificationAutoConfigurationTest {
    private final ApplicationContextRunner contextRunner = new ApplicationContextRunner()
            .withConfiguration(AutoConfigurations.of(WechatDomainVerificationAutoConfiguration.class));

    @Test
    void registersControllerWithoutSupplierQuoteBusinessBeans() {
        contextRunner.run(context -> assertThat(context)
                .hasBean("supplierQuoteWechatDomainVerificationController"));
    }
}
