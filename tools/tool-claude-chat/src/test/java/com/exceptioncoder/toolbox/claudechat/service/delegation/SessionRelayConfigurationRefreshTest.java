package com.exceptioncoder.toolbox.claudechat.service.delegation;

import com.exceptioncoder.toolbox.claudechat.config.SessionRelayProperties;
import com.exceptioncoder.toolbox.claudechat.domain.delegation.SessionGrantException;
import com.exceptioncoder.toolbox.common.dynamicconfig.DynamicConfigException;
import com.exceptioncoder.toolbox.common.dynamicconfig.config.DynamicConfigEnvironmentPostProcessor;
import com.exceptioncoder.toolbox.common.dynamicconfig.registry.RefreshableConfigRegistry;
import com.exceptioncoder.toolbox.common.dynamicconfig.repository.DynamicConfigOverrideRepository;
import com.exceptioncoder.toolbox.common.dynamicconfig.service.DynamicConfigService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.context.properties.ConfigurationProperties;
import com.exceptioncoder.toolbox.common.dynamicconfig.annotation.Refreshable;
import lombok.Getter;
import lombok.Setter;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.MapPropertySource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class SessionRelayConfigurationRefreshTest {
    private static final String PREFIX = SessionRelayProperties.PREFIX;
    private static final String CLIENTS = PREFIX + ".clients";

    @TempDir
    Path directory;

    @Test
    void refreshesRotationDisableDeletionAndEmptyListAcrossRestart() {
        Path database = directory.resolve("refresh.db");
        try (var context = context(database)) {
            var service = context.getBean(DynamicConfigService.class);
            var auth = context.getBean(SessionRelayClientAuthenticator.class);
            assertThat(auth.authenticate(basic("legacy", "old-secret"))).isEqualTo("legacy");
            save(service, "one", "one-secret", "erp", "erp-secret");
            assertThat(auth.authenticate(basic("one", "one-secret"))).isEqualTo("one");
            assertThat(auth.authenticate(basic("erp", "erp-secret"))).isEqualTo("erp");
            denied(auth, "legacy", "old-secret");

            service.applyOverrides(PREFIX, Map.of(CLIENTS + "[0].client-secret", "rotated"), List.of());
            denied(auth, "one", "one-secret");
            assertThat(auth.authenticate(basic("one", "rotated"))).isEqualTo("one");
            service.applyOverrides(PREFIX, Map.of(CLIENTS + "[0].enabled", "false"), List.of());
            denied(auth, "one", "rotated");
            assertThat(auth.authenticate(basic("erp", "erp-secret"))).isEqualTo("erp");

            save(service, "erp", "erp-secret");
            denied(auth, "one", "rotated");
            assertThat(auth.authenticate(basic("erp", "erp-secret"))).isEqualTo("erp");
            save(service);
            denied(auth, "erp", "erp-secret");
            denied(auth, "legacy", "old-secret");
        }
        try (var context = context(database)) {
            var service = context.getBean(DynamicConfigService.class);
            var auth = context.getBean(SessionRelayClientAuthenticator.class);
            service.loadPersistedOverrides();
            denied(auth, "erp", "erp-secret");
            denied(auth, "legacy", "old-secret");
            service.reset(PREFIX);
            assertThat(auth.authenticate(basic("legacy", "old-secret"))).isEqualTo("legacy");
            assertThat(context.getBean(DynamicConfigOverrideRepository.class).findAll()).isEmpty();
        }
    }

    @Test
    void preservesScalarAndStringListConfigurationContract() {
        try (var context = context(directory.resolve("generic.db"))) {
            var service = context.getBean(DynamicConfigService.class);
            service.applyOverrides("test.refresh", Map.of("test.refresh.limit", "7",
                    "test.refresh.names[0]", "one", "test.refresh.names[1]", "two"),
                    List.of("test.refresh.names"));
            assertThat(service.view("test.refresh").entries()).anySatisfy(entry -> {
                assertThat(entry.key()).isEqualTo("test.refresh.names");
                assertThat(entry.values()).containsExactly("one", "two");
            });
            assertThatThrownBy(() -> service.applyOverrides("test.refresh",
                    Map.of("test.refresh.limit", "invalid"), List.of()))
                    .isInstanceOf(DynamicConfigException.class);
            assertThat(context.getEnvironment().getProperty("test.refresh.limit")).isEqualTo("7");
            service.applyOverrides("test.refresh", Map.of("test.refresh.names", ""), List.of("test.refresh.names"));
            assertThat(service.view("test.refresh").entries()).anySatisfy(entry -> {
                assertThat(entry.key()).isEqualTo("test.refresh.names");
                assertThat(entry.values()).isEmpty();
            });
            service.reset("test.refresh");
            assertThat(service.view("test.refresh").entries()).anySatisfy(entry -> {
                assertThat(entry.key()).isEqualTo("test.refresh.limit");
                assertThat(entry.value()).isEqualTo("3");
            });
        }
    }

    @Test
    void restoresClientsAfterRestartAndRefreshesGlobalSwitch() {
        Path database = directory.resolve("populated.db");
        try (var context = context(database)) {
            save(context.getBean(DynamicConfigService.class), "one", "secret");
        }
        try (var context = context(database)) {
            var service = context.getBean(DynamicConfigService.class);
            var auth = context.getBean(SessionRelayClientAuthenticator.class);
            service.loadPersistedOverrides();
            assertThat(auth.authenticate(basic("one", "secret"))).isEqualTo("one");
            service.applyOverrides(PREFIX, Map.of(PREFIX + ".enabled", "false"), List.of());
            denied(auth, "one", "secret");
            service.applyOverrides(PREFIX, Map.of(PREFIX + ".enabled", "true"), List.of());
            assertThat(auth.authenticate(basic("one", "secret"))).isEqualTo("one");
        }
    }

    @Test
    void rejectsInvalidCandidateAndRollsBackPartialSqlFailure() {
        try (var context = context(directory.resolve("rollback.db"))) {
            var service = context.getBean(DynamicConfigService.class);
            var auth = context.getBean(SessionRelayClientAuthenticator.class);
            var repository = context.getBean(DynamicConfigOverrideRepository.class);
            save(service, "one", "secret");
            Map<String, String> previous = repository.findAll();
            assertThatThrownBy(() -> save(service, "one", "secret", "one", "other"))
                    .isInstanceOf(DynamicConfigException.class);
            assertThatThrownBy(() -> save(service, "one", ""))
                    .isInstanceOf(DynamicConfigException.class);
            assertThat(repository.findAll()).isEqualTo(previous);
            assertThat(auth.authenticate(basic("one", "secret"))).isEqualTo("one");

            context.getBean(JdbcTemplate.class).execute("""
                    CREATE TRIGGER reject_secret BEFORE INSERT ON dynamic_config_override
                    WHEN NEW.config_key LIKE '%.client-secret'
                    BEGIN SELECT RAISE(ABORT, 'test storage failure'); END
                    """);
            assertThatThrownBy(() -> save(service, "two", "new-secret"))
                    .isInstanceOf(org.springframework.dao.DataAccessException.class);
            assertThat(repository.findAll()).isEqualTo(previous);
            assertThat(auth.authenticate(basic("one", "secret"))).isEqualTo("one");
            denied(auth, "two", "new-secret");
        }
    }

    private AnnotationConfigApplicationContext context(Path database) {
        var context = new AnnotationConfigApplicationContext();
        context.getEnvironment().getPropertySources().addFirst(new MapPropertySource(
                DynamicConfigEnvironmentPostProcessor.SOURCE_NAME, new LinkedHashMap<>()));
        context.getEnvironment().getPropertySources().addLast(new MapPropertySource("deployment", Map.of(
                PREFIX + ".enabled", "true", PREFIX + ".client-id", "legacy",
                PREFIX + ".client-secret", "old-secret")));
        var dataSource = new DriverManagerDataSource("jdbc:sqlite:" + database);
        var jdbc = new JdbcTemplate(dataSource);
        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS dynamic_config_override
                (config_key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL)
                """);
        context.registerBean(JdbcTemplate.class, () -> jdbc);
        context.registerBean(DataSourceTransactionManager.class, () -> new DataSourceTransactionManager(dataSource));
        context.register(PropertiesConfiguration.class, DynamicConfigOverrideRepository.class,
                RefreshableConfigRegistry.class, DynamicConfigService.class, SessionRelayClientAuthenticator.class);
        context.refresh();
        return context;
    }

    private void save(DynamicConfigService service, String... credentials) {
        Map<String, String> values = new LinkedHashMap<>();
        values.put(PREFIX + ".enabled", "true");
        values.put(PREFIX + ".managed", "true");
        if (credentials.length == 0) {
            values.put(CLIENTS, "");
        }
        for (int i = 0; i < credentials.length; i += 2) {
            String key = CLIENTS + "[" + i / 2 + "]";
            values.put(key + ".client-id", credentials[i]);
            values.put(key + ".name", credentials[i]);
            values.put(key + ".client-secret", credentials[i + 1]);
            values.put(key + ".enabled", "true");
        }
        service.applyOverrides(PREFIX, values, List.of(CLIENTS));
    }

    private void denied(SessionRelayClientAuthenticator auth, String id, String secret) {
        assertThatThrownBy(() -> auth.authenticate(basic(id, secret))).isInstanceOf(SessionGrantException.class);
    }

    private String basic(String id, String secret) {
        return "Basic " + Base64.getEncoder().encodeToString((id + ":" + secret).getBytes(StandardCharsets.UTF_8));
    }

    @Configuration(proxyBeanMethods = false)
    @EnableConfigurationProperties({SessionRelayProperties.class, TestProperties.class})
    static class PropertiesConfiguration {
    }

    /** 验证公共配置 API 的标量与字符串列表兼容性。 */
    @Getter
    @Setter
    @Refreshable(name = "Test")
    @ConfigurationProperties(prefix = "test.refresh")
    public static class TestProperties {
        private int limit = 3;
        private List<String> names = new java.util.ArrayList<>();
    }
}
