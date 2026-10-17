package com.exceptioncoder.toolbox.foreconsult.service;

import com.exceptioncoder.toolbox.common.auth.web.AuthContext;
import com.exceptioncoder.toolbox.common.auth.web.AuthPrincipal;
import com.exceptioncoder.toolbox.common.project.ProjectAccess;
import com.exceptioncoder.toolbox.common.project.ProjectCatalog;
import com.exceptioncoder.toolbox.foreconsult.api.dto.StartSessionRequest;
import com.exceptioncoder.toolbox.foreconsult.domain.ConsultSession;
import com.exceptioncoder.toolbox.foreconsult.domain.ConsultSourceRouting;
import com.exceptioncoder.toolbox.foreconsult.domain.ConsultSystemPref;
import com.exceptioncoder.toolbox.foreconsult.repository.ConsultSessionRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class ConsultSourceRoutingServiceTest {
    @TempDir Path directory;
    ProjectCatalog catalog;
    ProjectAccess access;
    SystemPrefService prefs;
    ConsultSessionRepository sessions;
    ConsultSourceRoutingService service;
    List<ProjectCatalog.Entry> entries;
    Path web;
    Path api;

    @BeforeEach void setup() throws Exception {
        web = Files.createDirectory(directory.resolve("web"));
        api = Files.createDirectory(directory.resolve("api"));
        Files.writeString(api.resolve("Order.java"), "class Order {}");
        entries = List.of(entry("web", web), entry("api", api));
        catalog = mock(ProjectCatalog.class);
        access = mock(ProjectAccess.class, CALLS_REAL_METHODS);
        prefs = mock(SystemPrefService.class);
        sessions = mock(ConsultSessionRepository.class);
        var routes = mock(ConsultEvidenceRouteService.class);
        when(routes.resolve(anyString(), anyList(), anyString()))
                .thenReturn(new ConsultEvidenceRouteResolution(List.of(), "[]", "", List.of()));
        when(catalog.list(false)).thenReturn(entries);
        when(access.allowed(any())).thenReturn(true);
        when(prefs.listAll()).thenReturn(List.of(pref("web", web, 0), pref("api", api, 1)));
        service = new ConsultSourceRoutingService(catalog, access, prefs, sessions, routes, new ObjectMapper());
    }

    @AfterEach void cleanup() { AuthContext.clear(); }

    @Test void startsInAdministratorOrderWithoutUsingHistoryOrClaimingAnIdentity() {
        AuthContext.set(new AuthPrincipal(7, "tester", List.of(), List.of(), "test", 0));
        when(sessions.findRecentByUserId("7", 100)).thenReturn(List.of(
                ConsultSession.builder().systemSourcePath(api.toString()).build()));
        var prepared = service.prepare(request(true, null));
        assertThat(prepared.request().systemSourcePath()).isEqualTo(web.toString());
        assertThat(prepared.scope().focusedProject()).isNull();
        assertThat(prepared.scope().projects()).extracting(ConsultSourceRouting.Project::id).containsExactly("web", "api");
        assertThat(ConsultSourceRouting.read(prepared.scope().wrap("[]")).unresolved()).isTrue();
        assertThat(ConsultSourceRoutingService.instructions(prepared.scope()))
                .contains("从上往下逐个", "不是截图归属", "不得查询数据库", "不反复等待", "不得按使用频次或自行重排");
        verify(sessions, never()).findRecent(anyInt());
        verify(sessions, never()).findRecentByUserId(anyString(), anyInt());
    }

    @Test void selectedSystemMovesFirstWithoutRemovingFallbacksOrBecomingConfirmedFocus() {
        var prepared = service.prepare(request(true, api.toString()));
        assertThat(prepared.request().systemSourcePath()).isEqualTo(api.toString());
        assertThat(prepared.scope().projects()).extracting(ConsultSourceRouting.Project::id).containsExactly("api", "web");
        assertThat(prepared.scope().focusedProject()).isNull();
        when(prefs.listAll()).thenReturn(List.of(pref("web", web, 5), pref("api", api, 0)));
        assertThat(service.candidates()).extracting(ConsultSourceRouting.Project::id).containsExactly("api", "web");
        assertThatThrownBy(() -> service.prepare(request(true, directory.toString())))
                .hasMessageContaining("优先系统已不可用");
    }

    @Test void selectedSystemBeyondLimitIsIncludedAndRemainingAdministratorOrderIsStable() throws Exception {
        var all = new java.util.ArrayList<>(entries);
        var preferences = new java.util.ArrayList<>(List.of(pref("web", web, 0), pref("api", api, 1)));
        for (int index = 2; index < 10; index++) {
            String name = "project" + index;
            Path path = Files.createDirectory(directory.resolve(name));
            all.add(entry(name, path)); preferences.add(pref(name, path, index));
        }
        when(catalog.list(false)).thenReturn(all);
        when(prefs.listAll()).thenReturn(preferences);
        assertThat(service.prepare(request(true, directory.resolve("project9").toString())).scope().projects())
                .extracting(ConsultSourceRouting.Project::id)
                .containsExactly("project9", "web", "api", "project2", "project3", "project4", "project5", "project6");
    }

    @Test void limitsCandidatesToVisibleAvailableNonExcludedProjectsAndRejectsArbitraryPinnedPaths() {
        when(prefs.listAll()).thenReturn(List.of(pref("api", api, 1)));
        assertThat(service.candidates()).extracting(ConsultSourceRouting.Project::id).containsExactly("api");
        when(access.allowed(api)).thenReturn(false);
        assertThat(service.candidates()).isEmpty();
        assertThatThrownBy(() -> service.prepare(request(true, null))).hasMessageContaining("暂无可探索系统");
        assertThatThrownBy(() -> service.prepare(request(false, directory.toString()))).hasMessageContaining("可用目录");
    }

    @Test void recordsEvidenceFocusPreservesCandidatesAndHonorsUserCorrection() {
        var scope = service.prepare(request(true, null)).scope();
        var session = ConsultSession.builder().sessionId("consult").archiveStatus("PENDING")
                .systemName("web").systemSourcePath(web.toString()).evidenceRouteSnapshot(scope.wrap("[]")).build();
        when(sessions.findById("consult")).thenReturn(Optional.of(session));
        when(sessions.findByDevSessionId("runtime")).thenReturn(Optional.of(session));
        doAnswer(invocation -> {
            session.setEvidenceRouteSnapshot(invocation.getArgument(3));
            session.setSystemSourcePath(invocation.getArgument(2));
            return null;
        }).when(sessions).updateSourceRouting(anyString(), anyString(), anyString(), anyString(), anyString(), anyString());
        assertThatThrownBy(() -> service.focus("consult", "api", "../web/none.ts", "request chain", false))
                .isInstanceOf(IllegalArgumentException.class);
        var focus = service.focusRuntime("runtime", "api", "Order.java", "页面请求映射到订单接口");
        assertThat(focus.selectedBy()).isEqualTo("MODEL_INFERRED");
        assertThat(focus.projects()).hasSize(2);
        assertThat(session.getSystemSourcePath()).isEqualTo(api.toString());
        var corrected = service.focus("consult", "web", null, null, true);
        assertThat(corrected.automatic()).isFalse();
        assertThatThrownBy(() -> service.focus("consult", "api", "Order.java", "重试", false))
                .hasMessageContaining("用户已纠正");
        assertThat(service.focus("consult", "web", null, null, false).selectedBy()).isEqualTo("USER");
    }

    @Test void rechecksRemovedProjectsAndExcludedDescendantsAtEveryRead() {
        var scope = service.prepare(request(true, null)).scope();
        var session = ConsultSession.builder().sessionId("consult").evidenceRouteSnapshot(scope.wrap("[]")).build();
        when(sessions.findByDevSessionId("runtime")).thenReturn(Optional.of(session));
        when(access.allowed(api.resolve("Order.java"))).thenReturn(false);
        assertThatThrownBy(() -> service.forRuntime("runtime", "api", "Order.java"))
                .hasMessageContaining("排除");
        when(catalog.list(false)).thenReturn(List.of(entries.getFirst()));
        assertThat(service.forRuntime("runtime").projects()).extracting(ConsultSourceRouting.Project::id).containsExactly("web");
        assertThatThrownBy(() -> service.forRuntime("runtime", "api", "Order.java")).hasMessageContaining("可用候选");
    }

    @Test void optimisticPersistenceDoesNotOverwriteConcurrentCorrectionOrArchivedSession() {
        var source = new DriverManagerDataSource("jdbc:sqlite:" + directory.resolve("routing.db"));
        var jdbc = new JdbcTemplate(source);
        jdbc.execute("CREATE TABLE consult_session (session_id TEXT PRIMARY KEY, system_name TEXT, "
                + "system_source_path TEXT, module_names TEXT, evidence_route_snapshot TEXT, evidence_systems TEXT, archive_status TEXT)");
        jdbc.update("INSERT INTO consult_session VALUES (?, ?, ?, ?, ?, ?, ?)", "one", "web", "web", "[]", "old", "[]", "PENDING");
        var repository = new ConsultSessionRepository(jdbc);
        repository.updateSourceRouting("one", "api", "api", "new", "[]", "old");
        assertThatThrownBy(() -> repository.updateSourceRouting("one", "wrong", "wrong", "wrong", "[]", "old"))
                .hasMessageContaining("状态已变更");
        assertThat(jdbc.queryForObject("SELECT system_name FROM consult_session WHERE session_id = 'one'", String.class)).isEqualTo("api");
        assertThat(jdbc.queryForObject("SELECT module_names FROM consult_session WHERE session_id = 'one'", String.class)).isNull();
        jdbc.update("UPDATE consult_session SET archive_status = 'SUCCESS' WHERE session_id = 'one'");
        assertThatThrownBy(() -> repository.updateSourceRouting("one", "wrong", "wrong", "wrong", "[]", "new"))
                .hasMessageContaining("状态已变更");
    }

    private ProjectCatalog.Entry entry(String name, Path path) {
        return new ProjectCatalog.Entry(name, name, name, path.toString(), directory.toString(), true, false, "REGISTERED");
    }
    private ConsultSystemPref pref(String name, Path path, int order) {
        return ConsultSystemPref.builder().systemName(name).systemSourcePath(path.toString())
                .alias(name).visible(true).sortOrder(order).build();
    }
    private StartSessionRequest request(boolean automatic, String path) {
        return new StartSessionRequest("api", path, List.of(), "261017-价格问题", "为什么下限65", null,
                "BIZ", "codex", null, null, null, null, "v4", automatic);
    }
}
