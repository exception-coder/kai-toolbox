package com.exceptioncoder.toolbox.foreconsult.service;

import com.exceptioncoder.toolbox.common.dynamicconfig.config.DynamicConfigEnvironmentPostProcessor;
import com.exceptioncoder.toolbox.common.dynamicconfig.repository.DynamicConfigOverrideRepository;
import com.exceptioncoder.toolbox.common.dynamicconfig.registry.RefreshableConfigRegistry;
import com.exceptioncoder.toolbox.common.dynamicconfig.service.DynamicConfigService;
import com.exceptioncoder.toolbox.foreconsult.config.ConsultAttachmentProperties;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.autoconfigure.context.ConfigurationPropertiesAutoConfiguration;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.cloud.autoconfigure.ConfigurationPropertiesRebinderAutoConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.MapPropertySource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.core.io.ClassPathResource;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import static org.assertj.core.api.Assertions.*;

/** 实际配置中心+重绑定+临时SQLite，避免仅以mock验证动态配置。 */
class ConsultAttachmentRefreshTest {
    @TempDir Path temp;
    @Test void persistsRebindsRejectsInvalidAndRestoresAfterContextRecreation() {
        var runner = new ApplicationContextRunner()
                .withConfiguration(AutoConfigurations.of(ConfigurationPropertiesAutoConfiguration.class, ConfigurationPropertiesRebinderAutoConfiguration.class))
                .withUserConfiguration(Config.class)
                .withInitializer(context -> context.getEnvironment().getPropertySources().addFirst(
                        new MapPropertySource(DynamicConfigEnvironmentPostProcessor.SOURCE_NAME, new ConcurrentHashMap<>())))
                .withPropertyValues("test.database=" + temp.resolve("settings.db"));
        runner.run(context -> {
            assertThat(context).hasNotFailed();
            var service = context.getBean(DynamicConfigService.class);
            var properties = context.getBean(ConsultAttachmentProperties.class);
            service.applyOverrides(ConsultAttachmentProperties.PREFIX, values("120", "80"), List.of());
            assertThat(properties.getUploadMaxMb()).isEqualTo(120);
            assertThat(properties.getReadMaxMb()).isEqualTo(80);
            assertThatThrownBy(() -> service.applyOverrides(ConsultAttachmentProperties.PREFIX, values("10", "80"), List.of())).isInstanceOf(RuntimeException.class);
            assertThat(properties.getUploadMaxMb()).isEqualTo(120);
            assertThat(context.getBean(DynamicConfigOverrideRepository.class).findAll()).containsEntry(ConsultAttachmentProperties.PREFIX + ".upload-max-mb", "120");
        });
        runner.run(context -> {
            assertThat(context).hasNotFailed();
            context.getBean(DynamicConfigService.class).loadPersistedOverrides();
            assertThat(context.getBean(ConsultAttachmentProperties.class).getReadMaxMb()).isEqualTo(80);
        });
    }

    private Map<String,String> values(String upload, String read) {
        return Map.of(ConsultAttachmentProperties.PREFIX + ".upload-max-mb",upload,ConsultAttachmentProperties.PREFIX + ".read-max-mb",read);
    }

    @Configuration(proxyBeanMethods = false)
    @EnableConfigurationProperties(ConsultAttachmentProperties.class)
    static class Config {
        @Bean DriverManagerDataSource dataSource(org.springframework.core.env.Environment environment) {
            var source = new DriverManagerDataSource("jdbc:sqlite:" + environment.getRequiredProperty("test.database"));
            new ResourceDatabasePopulator(new ClassPathResource("db/dynamic-config-schema.sql")).execute(source);
            return source;
        }
        @Bean DynamicConfigOverrideRepository overrides(DriverManagerDataSource source) { return new DynamicConfigOverrideRepository(new JdbcTemplate(source)); }
        @Bean RefreshableConfigRegistry registry(org.springframework.context.ApplicationContext context) { return new RefreshableConfigRegistry(context); }
        @Bean DynamicConfigService dynamic(org.springframework.core.env.ConfigurableEnvironment environment,
                org.springframework.context.ApplicationEventPublisher publisher, DynamicConfigOverrideRepository repository,
                RefreshableConfigRegistry registry, DriverManagerDataSource source) {
            return new DynamicConfigService(environment,publisher,repository,registry,new DataSourceTransactionManager(source));
        }
    }
}
