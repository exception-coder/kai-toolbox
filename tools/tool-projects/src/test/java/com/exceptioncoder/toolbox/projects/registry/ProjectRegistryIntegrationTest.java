package com.exceptioncoder.toolbox.projects.registry;

import com.exceptioncoder.toolbox.common.requirement.RequirementRegistrationPort;
import com.exceptioncoder.toolbox.projects.registry.application.*;
import com.exceptioncoder.toolbox.projects.registry.domain.*;
import com.exceptioncoder.toolbox.projects.registry.infrastructure.JdbcProjectRegistryStore;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.EnableTransactionManagement;

import javax.sql.DataSource;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

/** 使用真实 SQLite 与 Spring 事务验证注册、初始化发布及需求绑定原子性。 */
@SpringJUnitConfig(ProjectRegistryIntegrationTest.Config.class)
class ProjectRegistryIntegrationTest {
    @Autowired ProjectRegistryStore store;
    @Autowired ProjectRegistryService projects;
    @Autowired SystemInitService initialization;
    @Autowired SystemTaskService tasks;
    @Autowired ProjectEvidencePort evidence;
    @Autowired JdbcTemplate jdbc;

    @BeforeEach
    void resetState() {
        jdbc.update("DELETE FROM forge_system_task");
        jdbc.update("DELETE FROM forge_system_profile");
        jdbc.update("DELETE FROM forge_system_init_run");
        jdbc.update("DELETE FROM forge_project");
        jdbc.update("DELETE FROM registry_test_requirement");
        reset(evidence);
        when(evidence.canonicalPath(anyString())).thenAnswer(call -> call.getArgument(0));
        when(evidence.scan(anyString())).thenReturn(new ProjectEvidencePort.RepositorySnapshot(
                "source-a", List.of("pom.xml"), true, Map.of()));
        when(evidence.graph(anyString())).thenReturn(new ProjectEvidencePort.GraphEvidence(true, true, 3, "fresh"));
        when(evidence.assets(anyString(), any())).thenReturn(List.of(
                new SystemProfile.Asset("PROJECT", "Project Profile", "READY", List.of("pom.xml"), Map.of())));
    }

    @Test
    void registrationPersistsAndRejectsCanonicalDuplicates() {
        RegistryProject project = projects.register(metadata("Forge", "D:/repo"));
        assertThat(project.state()).isEqualTo("UNINITIALIZED");
        assertThat(store.project(project.id())).contains(project);
        assertThatThrownBy(() -> projects.register(metadata("Other", "D:/repo")))
                .hasMessageContaining("已登记");
        assertThat(store.projects()).hasSize(1);
    }

    @Test
    void claimRejectsDuplicateAndMetadataMutation() {
        RegistryProject project = projects.register(metadata("Forge", "D:/repo"));
        store.claim(run(project));
        assertThatThrownBy(() -> store.claim(run(project))).hasMessageContaining("正在运行");
        assertThatThrownBy(() -> projects.update(project.id(), metadata("Rename", "D:/repo")))
                .hasMessageContaining("初始化期间");
        assertThat(store.runs(project.id())).hasSize(1);
    }

    @Test
    void successfulRunPublishesAndSourceDriftRequiresSync() {
        RegistryProject project = projects.register(metadata("Forge", "D:/repo"));
        SystemInitRun run = run(project);
        store.claim(run);
        initialization.execute(project, run);
        assertThat(projects.detail(project.id()).project().state()).isEqualTo("AI_READY");
        assertThat(store.profile(project.id(), 1)).isPresent();
        assertThat(store.runs(project.id()).getFirst().state()).isEqualTo("COMPLETED");
        when(evidence.scan(anyString())).thenReturn(new ProjectEvidencePort.RepositorySnapshot(
                "source-b", List.of("pom.xml"), true, Map.of()));
        assertThat(projects.detail(project.id()).project().state()).isEqualTo("SYNC_REQUIRED");
    }

    @Test
    void failedReinitializationPreservesPreviousVersion() {
        RegistryProject project = projects.register(metadata("Forge", "D:/repo"));
        SystemInitRun first = run(project);
        store.claim(first);
        initialization.execute(project, first);
        RegistryProject updated = projects.require(project.id());
        SystemInitRun second = run(updated);
        store.claim(second);
        when(evidence.scan(anyString())).thenThrow(new IllegalStateException("不可读"));
        initialization.execute(updated, second);
        assertThat(projects.require(project.id()).state()).isEqualTo("FAILED");
        assertThat(store.profile(project.id(), 1)).isPresent();
        assertThat(store.profile(project.id(), 2)).isEmpty();
    }

    @Test
    void missingEvidencePublishesDegradedAndInterruptedRunIsRecoverable() {
        RegistryProject project = projects.register(metadata("Forge", "D:/repo"));
        when(evidence.assets(anyString(), any())).thenReturn(List.of(
                new SystemProfile.Asset("CODE", "Code Intelligence", "MISSING", List.of(), Map.of())));
        var first = run(project);
        store.claim(first);
        initialization.execute(project, first);
        assertThat(projects.require(project.id()).state()).isEqualTo("DEGRADED");
        store.claim(run(projects.require(project.id())));
        store.recoverInterrupted();
        assertThat(projects.require(project.id()).state()).isEqualTo("FAILED");
        assertThat(store.runs(project.id())).noneMatch(item -> item.state().equals("RUNNING"));
        assertThat(store.profile(project.id(), 1)).isPresent();
    }

    @Test
    void taskUsesExistingRequirementAndCarriesSystemContext() {
        RegistryProject project = projects.register(metadata("Forge", "D:/repo"));
        var task = tasks.create(project.id(), new SystemTaskService.TaskInput("计数刷新", "删除后刷新统计", "", ""));
        assertThat(jdbc.queryForObject("SELECT COUNT(id) FROM registry_test_requirement", Integer.class)).isEqualTo(1);
        assertThat(task.projectId()).isEqualTo(project.id());
        assertThat(task.profileVersion()).isZero();
        assertThat(tasks.handoff(project.id(), task.id())).contains(project.id(), "D:/repo", "尚无初始化画像", "删除后刷新统计");
        assertThatThrownBy(() -> tasks.create("unknown", new SystemTaskService.TaskInput("a", "b", "", "")))
                .hasMessageContaining("未登记");
    }

    @Test
    void failedBindingRollsBackRequirementRegistration() {
        RegistryProject project = projects.register(metadata("Forge", "D:/repo"));
        jdbc.execute("CREATE TRIGGER reject_binding BEFORE INSERT ON forge_system_task BEGIN SELECT RAISE(ABORT, 'binding failed'); END");
        try {
            assertThatThrownBy(() -> tasks.create(project.id(), new SystemTaskService.TaskInput("a", "b", "", "")))
                    .isInstanceOf(RuntimeException.class);
            assertThat(jdbc.queryForObject("SELECT COUNT(id) FROM registry_test_requirement", Integer.class)).isZero();
        } finally {
            jdbc.execute("DROP TRIGGER reject_binding");
        }
    }

    @Test
    void missingModeAndSyncBeforeInitializationAreRejected() {
        RegistryProject project = projects.register(metadata("Forge", "D:/repo"));
        assertThatThrownBy(() -> initialization.start(project.id(), null)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> initialization.start(project.id(), "SYNC")).hasMessageContaining("先执行 Full Init");
        assertThat(store.runs(project.id())).isEmpty();
    }

    @Test
    void registrationRejectsCredentialUrls() {
        assertThatThrownBy(() -> projects.register(new RegistryProject.Metadata("Forge", "D:/repo", "git",
                "https://user:password@example.com/repo", "main", "", "", "")))
                .hasMessageContaining("凭据");
        assertThat(store.projects()).isEmpty();
    }

    private RegistryProject.Metadata metadata(String name, String path) {
        return new RegistryProject.Metadata(name, path, "git", "", "main", "", "", "team");
    }

    @Test
    void syncInvokesNativeUpdateAndPersistsItsEvidence() {
        RegistryProject project = projects.register(metadata("Forge", "D:/repo"));
        SystemInitRun first = run(project);
        store.claim(first);
        initialization.execute(project, first);
        RegistryProject current = projects.require(project.id());
        SystemInitRun template = run(current);
        SystemInitRun sync = new SystemInitRun(template.id(), current.id(), "SYNC", "RUNNING", template.stages(), "", template.startedAt(), template.updatedAt());
        when(evidence.syncGraph("D:/repo")).thenReturn("结构图增量更新完成；新增/修改 1，复用 2 个文件");
        store.claim(sync);
        initialization.execute(current, sync);
        verify(evidence).syncGraph("D:/repo");
        verify(evidence, never()).buildGraph(anyString());
        assertThat(store.profile(current.id(), 2)).isPresent();
        assertThat(store.runs(current.id()).getFirst().stages().get(2).message()).contains("增量更新完成");
    }

    @Test
    void failedIncrementalUpdateKeepsPreviousProfileAndDoesNotFallBackToFull() {
        RegistryProject project = projects.register(metadata("Forge", "D:/repo"));
        SystemInitRun first = run(project);
        store.claim(first);
        initialization.execute(project, first);
        RegistryProject current = projects.require(project.id());
        SystemInitRun template = run(current);
        SystemInitRun sync = new SystemInitRun(template.id(), current.id(), "SYNC", "RUNNING", template.stages(), "", template.startedAt(), template.updatedAt());
        when(evidence.syncGraph("D:/repo")).thenThrow(new IllegalStateException("基线无效，原图谱保留"));
        store.claim(sync);
        initialization.execute(current, sync);
        assertThat(store.profile(current.id(), 1)).isPresent();
        assertThat(store.profile(current.id(), 2)).isEmpty();
        assertThat(projects.require(current.id()).state()).isEqualTo("FAILED");
        verify(evidence, never()).buildGraph(anyString());
    }

    private SystemInitRun run(RegistryProject project) {
        var stages = List.of("repository", "environment", "graphify", "semantic", "mapping", "verification", "profile")
                .stream().map(name -> new SystemInitRun.Stage(name, name, "PENDING", "")).toList();
        return new SystemInitRun(UUID.randomUUID().toString(), project.id(), "FULL", "RUNNING", stages,
                "", System.currentTimeMillis(), System.currentTimeMillis());
    }

    @Configuration
    @EnableTransactionManagement
    static class Config {
        @Bean DataSource dataSource() {
            var source = new SingleConnectionDataSource("jdbc:sqlite::memory:", true);
            new ResourceDatabasePopulator(new ClassPathResource("db/project-registry-schema.sql")).execute(source);
            new JdbcTemplate(source).execute("CREATE TABLE registry_test_requirement(id TEXT PRIMARY KEY)");
            return source;
        }
        @Bean JdbcTemplate jdbc(DataSource source) { return new JdbcTemplate(source); }
        @Bean PlatformTransactionManager transactions(DataSource source) { return new DataSourceTransactionManager(source); }
        @Bean ProjectEvidencePort evidence() { return mock(ProjectEvidencePort.class); }
        @Bean ProjectRegistryStore store(JdbcTemplate jdbc) { return new JdbcProjectRegistryStore(jdbc, new ObjectMapper()); }
        @Bean ProjectRegistryService projects(ProjectRegistryStore store, ProjectEvidencePort evidence) {
            return new ProjectRegistryService(store, evidence);
        }
        @Bean SystemInitService initialization(ProjectRegistryStore store, ProjectRegistryService projects,
                                               ProjectEvidencePort evidence) {
            return new SystemInitService(store, projects, evidence);
        }
        @Bean RequirementRegistrationPort requirements(JdbcTemplate jdbc) {
            return command -> { String id = UUID.randomUUID().toString();
                jdbc.update("INSERT INTO registry_test_requirement(id) VALUES (?)", id); return id; };
        }
        @Bean SystemTaskService tasks(ProjectRegistryService projects, ProjectRegistryStore store,
                                      RequirementRegistrationPort requirements) {
            return new SystemTaskService(projects, store, requirements, new com.exceptioncoder.toolbox.projects.registry.infrastructure.DomainSnapshotStore(new com.fasterxml.jackson.databind.ObjectMapper()));
        }
    }
}
