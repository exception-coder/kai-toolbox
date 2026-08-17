package com.regentech_fashion.wyoooni.application;

import com.regentech_fashion.supplierquote.spi.SupplierQuoteStore;
import com.zaxxer.hikari.HikariDataSource;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.TestPropertySource;

import javax.sql.DataSource;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE)
@TestPropertySource(properties = {
        "regentech.wyoooni.local-data.file=target/wyoooni-application-test.db",
        "regentech.supplier-quote.erp-account.enabled=false",
        "regentech.supplier-quote.wechat.secure-cookie=false"
})
class WyoooniApplicationTest {
    @Autowired
    private SupplierQuoteStore store;
    @Autowired
    private DataSource dataSource;

    @Test
    void startsIndependentHostWithLocalSupplierQuoteStore() {
        assertThat(store).isNotNull();
        assertThat(dataSource).isInstanceOf(HikariDataSource.class);
        assertThat(((HikariDataSource) dataSource).getPoolName()).isEqualTo("wyoooni-local-sqlite");
    }
}
