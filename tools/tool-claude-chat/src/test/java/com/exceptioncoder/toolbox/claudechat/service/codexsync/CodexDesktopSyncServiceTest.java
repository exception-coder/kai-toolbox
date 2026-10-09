package com.exceptioncoder.toolbox.claudechat.service.codexsync;

import com.exceptioncoder.toolbox.claudechat.domain.SessionStatus;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import com.exceptioncoder.toolbox.claudechat.service.ClaudeChatSessionAccessPolicy;
import com.exceptioncoder.toolbox.claudechat.service.SidecarClient;
import com.exceptioncoder.toolbox.common.auth.web.AuthContext;
import com.exceptioncoder.toolbox.common.auth.web.AuthPrincipal;
import com.exceptioncoder.toolbox.common.project.ProjectAccess;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicLong;

import static com.exceptioncoder.toolbox.claudechat.service.codexsync.CodexSyncModels.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class CodexDesktopSyncServiceTest {
    @TempDir Path temp;
    private final ObjectMapper mapper = new ObjectMapper();
    private final SidecarClient sidecar = mock(SidecarClient.class);
    private final ProjectAccess projects = mock(ProjectAccess.class);
    private final AtomicLong clock = new AtomicLong(1000);
    private final CodexSyncPreviews previews = new CodexSyncPreviews(clock::get);
    private SingleConnectionDataSource source;
    private ClaudeChatSessionRepository sessions;
    private CodexDesktopSyncService service;
    private String home;
    private String cwd;

    @BeforeEach
    void setup() throws Exception {
        home = Files.createDirectory(temp.resolve(".codex")).toRealPath().toString();
        cwd = Files.createDirectory(temp.resolve("project")).toRealPath().toString();
        source = new SingleConnectionDataSource("jdbc:sqlite::memory:", true);
        JdbcTemplate jdbc = new JdbcTemplate(source);
        try (var input = getClass().getResourceAsStream("/db/claude-chat-schema.sql")) {
            String schema = new String(input.readAllBytes(), StandardCharsets.UTF_8);
            int start = schema.indexOf("CREATE TABLE IF NOT EXISTS claude_chat_session");
            jdbc.execute(schema.substring(start, schema.indexOf(");", start) + 2));
        }
        // This column is added by the existing ClaudeChatSchemaMigration on startup.
        jdbc.execute("ALTER TABLE claude_chat_session ADD COLUMN user_id INTEGER");
        sessions = new ClaudeChatSessionRepository(jdbc);
        when(projects.allowed(any())).thenReturn(true);
        CodexSyncHomes homes = mock(CodexSyncHomes.class);
        when(homes.resolve(anyString())).thenAnswer(call -> call.getArgument(0));
        service = new CodexDesktopSyncService(sidecar, mapper, homes, previews, sessions,
                new ClaudeChatSessionAccessPolicy(sessions), projects,
                new TransactionTemplate(new DataSourceTransactionManager(source)));
    }
    @AfterEach void cleanup() { AuthContext.clear(); source.destroy(); }

    private CodexSyncModels.Thread thread(String id, String directory) {
        return new CodexSyncModels.Thread(id, "桌面会话", directory, "project-1", "model-a", "high", 1000, 2000, "appServer");
    }
    private ImportRequest request(String account, List<CodexSyncModels.Thread> rows) {
        String token = previews.save(account, new Project("project-1", "主项目", List.of(cwd)), rows);
        return new ImportRequest(token, rows.stream().map(CodexSyncModels.Thread::id).toList());
    }

    @Test void repeatedImportUsesOneSessionAndPreservesUserChanges() {
        ImportRequest request = request(home, List.of(thread("native-1", cwd)));
        ImportResult first = service.importThreads(request);
        String id = first.sessions().getFirst().sessionId();
        sessions.updateTitle(id, "我的标题");
        sessions.updateSelectedModel(id, "my-model");
        sessions.touch(id, SessionStatus.RUNNING, 9000);
        sessions.updateGroup(id, "我的项目", "我的需求");
        ImportResult second = service.importThreads(request);
        assertThat(first.added()).isEqualTo(1);
        assertThat(second.added()).isZero();
        assertThat(second.reused()).isEqualTo(1);
        assertThat(sessions.findAll()).hasSize(1);
        var row = sessions.findById(id).orElseThrow();
        assertThat(row.getTitle()).isEqualTo("我的标题");
        assertThat(row.getSelectedModel()).isEqualTo("my-model");
        assertThat(row.getStatus()).isEqualTo(SessionStatus.RUNNING);
        assertThat(row.getGroupName()).isEqualTo("我的项目");
        assertThat(row.getSubgroupName()).isEqualTo("我的需求");
        assertThat(row.getCodexHome()).isEqualTo(home);
        assertThat(row.getSdkSessionId()).isEqualTo("native-1");
        assertThat(row.getEngineSessions()).isEqualTo("{\"codex\":\"native-1\"}");
        verifyNoInteractions(sidecar);
    }

    @Test void sameNativeIdInTwoHomesCreatesIsolatedLogicalSessions() throws Exception {
        String other = Files.createDirectory(temp.resolve(".codex-other")).toRealPath().toString();
        var a = service.importThreads(request(home, List.of(thread("same-id", cwd))));
        var b = service.importThreads(request(other, List.of(thread("same-id", cwd))));
        assertThat(a.sessions().getFirst().sessionId()).isNotEqualTo(b.sessions().getFirst().sessionId());
        assertThat(sessions.findById(a.sessions().getFirst().sessionId()).orElseThrow().getGroupName())
                .isNotEqualTo(sessions.findById(b.sessions().getFirst().sessionId()).orElseThrow().getGroupName());
        assertThat(service.importThreads(request(home, List.of(thread("same-id", cwd)))).reused()).isEqualTo(1);
        assertThat(sessions.findAll()).hasSize(2);
    }

    @Test void nativeProjectsWithTheSameNameAndUuidPrefixRemainSeparate() {
        for (String projectId : List.of("019abcdef-1", "019abcdef-2")) {
            var row = new CodexSyncModels.Thread(projectId, "会话", cwd, projectId, null, null, 1000, 2000, "appServer");
            String token = previews.save(home, new Project(projectId, "同名项目", List.of(cwd)), List.of(row));
            service.importThreads(new ImportRequest(token, List.of(row.id())));
        }
        assertThat(sessions.findAll().stream().map(row -> row.getGroupName()).distinct()).hasSize(2);
    }

    @Test void switchedEngineMappingStillReusesTheOriginalLogicalSession() {
        String id = service.importThreads(request(home, List.of(thread("codex-original", cwd)))).sessions().getFirst().sessionId();
        sessions.switchEngine(id, "claude", "codex,claude", "claude-id", "{\"codex\":\"codex-original\",\"claude\":\"claude-id\"}");
        var result = service.importThreads(request(home, List.of(thread("codex-original", cwd))));
        assertThat(result.reused()).isEqualTo(1);
        assertThat(sessions.findAll()).hasSize(1);
        assertThat(sessions.findById(id).orElseThrow().getEngine()).isEqualTo("claude");
    }

    @Test void invalidDirectoryRejectsWholeBatchBeforeInserting() {
        var request = request(home, List.of(thread("ok", cwd), thread("missing", temp.resolve("missing").toString())));
        assertThatThrownBy(() -> service.importThreads(request)).isInstanceOf(ResponseStatusException.class);
        assertThat(sessions.findAll()).isEmpty();
    }

    @Test void exclusionsAreRevalidatedAfterPreview() {
        var request = request(home, List.of(thread("id", cwd)));
        when(projects.allowed(any())).thenReturn(false);
        assertThatThrownBy(() -> service.importThreads(request)).hasMessageContaining("全局排除");
        assertThat(sessions.findAll()).isEmpty();
    }

    @Test void previewCannotBeForgedReusedByAnotherUserOrImportedAfterExpiry() {
        var request = request(home, List.of(thread("id", cwd)));
        assertThatThrownBy(() -> service.importThreads(new ImportRequest(request.previewToken(), List.of("not-in-preview"))))
                .hasMessageContaining("不在当前预览");
        AuthContext.set(new AuthPrincipal(2L, "other", List.of("ADMIN"), List.of(), "jti", 9999));
        assertThatThrownBy(() -> service.importThreads(request)).hasMessageContaining("预览已失效");
        AuthContext.clear();
        clock.set(601_001);
        assertThatThrownBy(() -> service.importThreads(request)).hasMessageContaining("预览已失效");
        assertThat(sessions.findAll()).isEmpty();
    }

    @Test void projectAndThreadQueriesKeepTheAccountCursorAndNativeIdentity() {
        var row = thread("native", cwd);
        var page = mapper.createObjectNode();
        page.set("data", mapper.valueToTree(List.of(row)));
        page.set("project", mapper.valueToTree(new Project("project-1", "主项目", List.of(cwd))));
        page.put("nextCursor", "next").put("fetchedAt", 12345);
        var reply = mapper.createObjectNode(); reply.set("page", page);
        when(sidecar.queryCodexDesktop(home, "threads", "cursor", "project-1")).thenReturn(Optional.of(reply));
        ThreadPage result = service.threads(home, "cursor", "project-1");
        assertThat(result.codexHome()).isEqualTo(home);
        assertThat(result.nextCursor()).isEqualTo("next");
        assertThat(result.fetchedAt()).isEqualTo(12345);
        assertThat(result.data().getFirst().thread().id()).isEqualTo("native");
        assertThat(service.importThreads(new ImportRequest(result.previewToken(), List.of("native"))).added()).isEqualTo(1);
        assertThat(sessions.findAll().getFirst().getGroupName()).startsWith("主项目 · Codex ");
        verify(sidecar).queryCodexDesktop(home, "threads", "cursor", "project-1");
        verifyNoMoreInteractions(sidecar);
    }
}
