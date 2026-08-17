package com.regentech_fashion.wyoooni.application;

import com.regentech_fashion.supplierquote.spi.SupplierQuoteStore;
import com.zaxxer.hikari.HikariDataSource;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;

import javax.sql.DataSource;

import static org.assertj.core.api.Assertions.assertThat;

/** 验证生产Profile能够加载拆分后的配置文件。 */
@ActiveProfiles("prod")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE)
@TestPropertySource(properties = {
        "spring.datasource.url=jdbc:h2:mem:wyoooni-prod;MODE=Oracle;DB_CLOSE_DELAY=-1",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.datasource.hikari.pool-name=wyoooni-business-oracle-test",
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect",
        "regentech.wyoooni.enterprise.base-url=https://enterprise.example.test",
        "regentech.wyoooni.enterprise.service-token=test-token",
        "regentech.supplier-quote.erp-account.enabled=false",
        "regentech.supplier-quote.erp-account.url=jdbc:oracle:thin:@example:1521:test",
        "regentech.supplier-quote.erp-account.username=test-user",
        "regentech.supplier-quote.erp-account.password=test-password",
        "regentech.supplier-quote.wechat.app-id=test-app-id",
        "regentech.supplier-quote.wechat.app-secret=test-app-secret",
        "regentech.supplier-quote.wechat.callback-url=https://quote.example.test/oauth/callback"
})
class WyoooniProductionConfigurationTest {
    @Autowired
    private SupplierQuoteStore store;
    @Autowired
    private DataSource dataSource;

    @Test
    void loadsProductionProfileImports() {
        assertThat(store).isNotNull();
        assertThat(dataSource).isInstanceOf(HikariDataSource.class);
        assertThat(((HikariDataSource) dataSource).getPoolName()).isEqualTo("wyoooni-business-oracle-test");
    }
}
