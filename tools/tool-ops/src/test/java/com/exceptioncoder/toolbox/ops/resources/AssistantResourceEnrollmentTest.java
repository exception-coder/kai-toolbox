package com.exceptioncoder.toolbox.ops.resources;

import com.exceptioncoder.toolbox.common.auth.web.AuthContext;
import com.exceptioncoder.toolbox.common.auth.web.AuthPrincipal;
import com.exceptioncoder.toolbox.ops.repository.DatasourceRepository;
import com.exceptioncoder.toolbox.ops.resources.application.ApplicationResourceService;
import com.exceptioncoder.toolbox.ops.resources.application.AssistantResourceEnrollment;
import com.exceptioncoder.toolbox.ops.resources.infrastructure.JdbcApplicationResourceRepository;
import com.exceptioncoder.toolbox.ops.security.OpsCredentialCipher;
import com.exceptioncoder.toolbox.ops.service.OpsDatasourceService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import java.nio.file.Path;
import java.util.List;
import java.util.UUID;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class AssistantResourceEnrollmentTest {
    @TempDir Path temp;
    SingleConnectionDataSource source;
    JdbcTemplate jdbc;
    DatasourceRepository datasources;
    JdbcApplicationResourceRepository applications;
    AssistantResourceEnrollment service;
    TransactionTemplate transaction;
    final com.exceptioncoder.toolbox.common.resource.HostEnrollmentGateway hostGateway = mock(com.exceptioncoder.toolbox.common.resource.HostEnrollmentGateway.class);

    @Test void hostEnrollmentUsesTheOwningModuleAndDeduplicatesTheReceipt() {
        when(hostGateway.register(any())).thenReturn("registered-host");
        var command = new AssistantResourceEnrollment.Command(UUID.randomUUID().toString(), "HOST", "ERP 生产主机",
                "PROD", "erp", "SSH", "10.0.0.8", 22, "", "", "", "ops", "secret");
        var first = transaction.execute(status -> service.enroll(command));
        var retried = transaction.execute(status -> service.enroll(command));
        assertThat(retried).isEqualTo(first);
        assertThat(first.configurationUrl()).isEqualTo("/tools/hosts");
        verify(hostGateway, times(1)).register(any());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM ops_datasource", Integer.class)).isZero();
    }

    @Test void resourcesCanUseSitWithoutARegisteredSystemAndRetainTheirOriginalEditPath() {
        var command = new AssistantResourceEnrollment.Command(UUID.randomUUID().toString(), "DATABASE", "共享 SIT 数据库",
                "SIT", null, "MYSQL", "10.0.0.9", 3306, "erp", "", "", "reader", "test-only-password");
        var receipt = transaction.execute(status -> service.enroll(command));
        var saved = datasources.findById(receipt.resourceId()).orElseThrow();
        assertThat(saved.getSystemId()).isEmpty();
        assertThat(saved.getEnv()).isEqualTo("SIT");
        assertThat(receipt.configurationUrl()).contains("editDatasource=" + saved.getId());
        var retried = transaction.execute(status -> service.enroll(command));
        assertThat(retried).isEqualTo(receipt);
        when(hostGateway.register(any())).thenReturn("shared-host");
        transaction.execute(status -> service.enroll(new AssistantResourceEnrollment.Command(UUID.randomUUID().toString(), "HOST",
                "共享主机", "DEV", "", "SSH", "10.0.0.10", 22, "", "", "", "ops", "test-only-password")));
        verify(hostGateway).register(argThat(value -> value.systemId().isEmpty() && value.environment().equals("DEV")));
        assertThat(jdbc.queryForObject("SELECT count(*) FROM ops_system", Integer.class)).isEqualTo(1);
        var invalid = new AssistantResourceEnrollment.Command(UUID.randomUUID().toString(), "DATABASE", "未知系统",
                "SIT", "does-not-exist", "MYSQL", "10.0.0.11", 3306, "erp", "", "", "reader", "test-only-password");
        assertThatThrownBy(() -> transaction.execute(status -> service.enroll(invalid))).hasMessageContaining("已有系统分组");
        var dto = new com.exceptioncoder.toolbox.ops.api.dto.DatasourceRequest(null, "SIT", "MYSQL", "修改共享库",
                "10.0.0.9", 3306, "reader", "", "erp", "", "", 0);
        var service = new OpsDatasourceService(datasources, mock(com.exceptioncoder.toolbox.ops.repository.QueryHistoryRepository.class),
                mock(com.exceptioncoder.toolbox.ops.service.OpsDataSourcePool.class));
        assertThat(service.update(saved.getId(), dto).getSystemId()).isEmpty();
    }

    @BeforeEach void setup() {
        source = new SingleConnectionDataSource("jdbc:sqlite::memory:", true);
        new ResourceDatabasePopulator(new ClassPathResource("db/ops-schema.sql"),
                new ClassPathResource("db/ops-resource-schema.sql"), new ClassPathResource("db/ops-assistant-schema.sql"))
                .execute(source);
        jdbc = new JdbcTemplate(source);
        jdbc.update("INSERT INTO ops_system(id,name,created_at,updated_at) VALUES('erp','ERP',1,1)");
        var cipher = new OpsCredentialCipher(temp.resolve("ops.key").toString());
        datasources = new DatasourceRepository(jdbc, cipher);
        applications = new JdbcApplicationResourceRepository(jdbc, cipher);
        var datasourceService = new OpsDatasourceService(datasources,
                mock(com.exceptioncoder.toolbox.ops.repository.QueryHistoryRepository.class),
                mock(com.exceptioncoder.toolbox.ops.service.OpsDataSourcePool.class));
        service = new AssistantResourceEnrollment(datasourceService, datasources,
                new ApplicationResourceService(applications), jdbc, cipher, new ObjectMapper(), List.of(hostGateway));
        transaction = new TransactionTemplate(new DataSourceTransactionManager(source));
        AuthContext.set(new AuthPrincipal(1, "admin", List.of("ADMIN"), List.of(), "test", Long.MAX_VALUE));
    }

    @AfterEach void cleanup() { AuthContext.clear(); source.destroy(); }

    AssistantResourceEnrollment.Command database(String request) {
        return new AssistantResourceEnrollment.Command(request, "DATABASE", "ERP 测试", "TEST", "erp",
                "ORACLE", "127.0.0.1", 1521, "test", null, null, "tester", "test-only-password");
    }

    @Test void enrollsOnceIntoOriginalStoreAndNeverReturnsOrStoresPlaintextPassword() {
        var command = database(UUID.randomUUID().toString());
        var first = transaction.execute(status -> service.enroll(command));
        var retried = transaction.execute(status -> service.enroll(command));
        assertThat(retried).isEqualTo(first);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM ops_datasource", Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT password FROM ops_datasource", String.class)).startsWith("forge-ops:v1:");
        assertThat(datasources.findById(first.resourceId()).orElseThrow().getPassword()).isEqualTo("test-only-password");
        assertThat(first.toString()).doesNotContain("password", "tester");
        assertThat(command.toString()).doesNotContain("test-only-password");
        assertThatThrownBy(() -> transaction.execute(status -> service.enroll(database(UUID.randomUUID().toString()))))
                .hasMessageContaining("已登记");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM ops_assistant_enrollment", Integer.class)).isEqualTo(1);
    }

    @Test void applicationAccountsUseTheSameOriginalRepositoryWithEncryptionAndRejectUrlCredentials() {
        var command = new AssistantResourceEnrollment.Command(UUID.randomUUID().toString(), "APPLICATION", "ERP 站点",
                "TEST", "", "", "", 1, "", "https://example.test", "/login", "tester", "private-value");
        var receipt = transaction.execute(status -> service.enroll(command));
        assertThat(jdbc.queryForObject("SELECT password FROM ops_application_resource", String.class))
                .startsWith("forge-ops:v1:").doesNotContain("private-value");
        assertThat(applications.findById(receipt.resourceId()).orElseThrow().password()).isEqualTo("private-value");
        var unsafe = new AssistantResourceEnrollment.Command(UUID.randomUUID().toString(), "APPLICATION", "坏地址",
                "TEST", "", "", "", 1, "", "https://tester:private@example.test", "", "tester", "value");
        assertThatThrownBy(() -> transaction.execute(status -> service.enroll(unsafe))).hasMessageContaining("不含凭据");
        AuthContext.set(new AuthPrincipal(2, "user", List.of(), List.of(), "test", Long.MAX_VALUE));
        assertThatThrownBy(() -> service.enroll(database(UUID.randomUUID().toString())))
                .isInstanceOf(com.exceptioncoder.toolbox.common.auth.AuthException.class);
    }

    @Test void readsLegacyCredentialsAndEncryptsThemOnTheNextNormalSave() {
        jdbc.update("""
                INSERT INTO ops_datasource(id,system_id,env,type,name,host,port,password,created_at,updated_at)
                VALUES ('legacy','erp','TEST','ORACLE','旧连接','127.0.0.2',1521,'legacy-only-value',1,1)
                """);
        var value = datasources.findById("legacy").orElseThrow();
        assertThat(value.getPassword()).isEqualTo("legacy-only-value");
        datasources.update(value);
        assertThat(jdbc.queryForObject("SELECT password FROM ops_datasource WHERE id='legacy'", String.class))
                .startsWith("forge-ops:v1:").doesNotContain("legacy-only-value");
        assertThat(datasources.findById("legacy").orElseThrow().getPassword()).isEqualTo("legacy-only-value");
    }
}
