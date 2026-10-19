package com.exceptioncoder.toolbox.hosts.service;

import com.exceptioncoder.toolbox.common.resource.ResourceCredentialCipher;
import com.exceptioncoder.toolbox.hosts.domain.Host;
import com.exceptioncoder.toolbox.hosts.domain.HostAuthType;
import com.exceptioncoder.toolbox.hosts.repository.HostRepository;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import static org.assertj.core.api.Assertions.*;

class HostCredentialStorageTest {
    @Test void sealsNewWritesAndReadsLegacyPasswordsThroughTheSharedPort() {
        var source = new SingleConnectionDataSource("jdbc:sqlite::memory:", true);
        try {
            new ResourceDatabasePopulator(new ClassPathResource("db/hosts-schema.sql")).execute(source);
            var jdbc = new JdbcTemplate(source);
            var cipher = new ResourceCredentialCipher() {
                public String encrypt(String value) { return value == null ? null : "sealed:" + Base64.getEncoder().encodeToString(value.getBytes(StandardCharsets.UTF_8)); }
                public String decrypt(String value) { return value != null && value.startsWith("sealed:") ? new String(Base64.getDecoder().decode(value.substring(7)), StandardCharsets.UTF_8) : value; }
            };
            var repository = new HostRepository(jdbc, cipher);
            var host = Host.builder().id("host").name("ERP PROD").host("10.0.0.1").port(22).username("ops")
                    .authType(HostAuthType.PASSWORD).password("a-secret").passphrase("another-secret").createdAt(1).updatedAt(1).build();
            repository.insert(host);
            assertThat(jdbc.queryForObject("SELECT password FROM host WHERE id='host'", String.class)).startsWith("sealed:").doesNotContain("a-secret");
            assertThat(repository.findById("host").orElseThrow().getPassword()).isEqualTo("a-secret");
            jdbc.update("UPDATE host SET password='legacy-password' WHERE id='host'");
            assertThat(repository.findById("host").orElseThrow().getPassword()).isEqualTo("legacy-password");
            repository.update(host);
            assertThat(repository.findById("host").orElseThrow().getPassphrase()).isEqualTo("another-secret");
        } finally { source.destroy(); }
    }
}
