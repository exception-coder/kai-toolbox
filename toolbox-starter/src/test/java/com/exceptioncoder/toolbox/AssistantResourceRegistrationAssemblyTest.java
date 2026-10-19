package com.exceptioncoder.toolbox;

import com.exceptioncoder.toolbox.common.resource.HostEnrollmentGateway;
import com.exceptioncoder.toolbox.common.resource.ResourceCredentialCipher;
import com.exceptioncoder.toolbox.hosts.repository.HostRepository;
import com.exceptioncoder.toolbox.hosts.service.AssistantHostEnrollment;
import com.exceptioncoder.toolbox.hosts.service.HostSshSessions;
import com.exceptioncoder.toolbox.hosts.service.HostsService;
import com.exceptioncoder.toolbox.ops.security.OpsCredentialCipher;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;

import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;

class AssistantResourceRegistrationAssemblyTest {
    @TempDir Path directory;

    @Test void wiresTheOwnerModulesAndEncryptsAHostWithoutOpeningSsh() {
        var source = new SingleConnectionDataSource("jdbc:sqlite::memory:", true);
        var sessions = mock(HostSshSessions.class);
        try {
            new ResourceDatabasePopulator(new ClassPathResource("db/hosts-schema.sql")).execute(source);
            var jdbc = new JdbcTemplate(source);
            new ApplicationContextRunner()
                    .withBean(JdbcTemplate.class, () -> jdbc)
                    .withBean(OpsCredentialCipher.class, () -> new OpsCredentialCipher(directory.resolve("ops.key").toString()))
                    .withBean(HostSshSessions.class, () -> sessions)
                    .withUserConfiguration(HostRepository.class, HostsService.class, AssistantHostEnrollment.class)
                    .run(context -> {
                        assertThat(context).hasNotFailed().hasSingleBean(ResourceCredentialCipher.class)
                                .hasSingleBean(HostEnrollmentGateway.class);
                        String id = context.getBean(HostEnrollmentGateway.class).register(new HostEnrollmentGateway.Command(
                                "ERP PROD SSH", "PROD", "erp", "10.0.0.8", 22, "ops", "test-password"));
                        assertThat(jdbc.queryForObject("SELECT password FROM host WHERE id=?", String.class, id))
                                .startsWith("forge-ops:v1:").doesNotContain("test-password");
                        assertThat(context.getBean(HostsService.class).findRequired(id).getPassword()).isEqualTo("test-password");
                        verifyNoInteractions(sessions);
                    });
        } finally { source.destroy(); }
    }
}
