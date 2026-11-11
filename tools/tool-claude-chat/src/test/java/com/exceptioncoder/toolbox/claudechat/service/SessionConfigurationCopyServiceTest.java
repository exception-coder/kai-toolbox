package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.api.SessionCopyController;
import com.exceptioncoder.toolbox.claudechat.domain.ClaudeChatSession;
import com.exceptioncoder.toolbox.claudechat.domain.SessionStatus;
import com.exceptioncoder.toolbox.claudechat.repository.AuthSessionLinkRepository;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import com.exceptioncoder.toolbox.claudechat.repository.SessionCopyRepository;
import com.exceptioncoder.toolbox.claudechat.repository.SessionProjectDirectoryRepository;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import org.springframework.jdbc.datasource.init.ScriptUtils;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.server.ResponseStatusException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.spy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** 使用真实 SQLite 事务核对副本与回执，避免仅凭调用顺序模拟原子性。 */
class SessionConfigurationCopyServiceTest {
    private SingleConnectionDataSource dataSource;
    private JdbcTemplate jdbc;
    private ClaudeChatSessionRepository sessions;
    private SessionProjectDirectoryRepository paths;
    private SessionCopyRepository copies;

    @BeforeEach
    void prepare() throws Exception {
        dataSource = new SingleConnectionDataSource("jdbc:sqlite::memory:", true);
        jdbc = new JdbcTemplate(dataSource);
        ScriptUtils.executeSqlScript(dataSource.getConnection(), new ClassPathResource("db/claude-chat-schema.sql"));
        ScriptUtils.executeSqlScript(dataSource.getConnection(), new ClassPathResource("db/claude-chat-copy-schema.sql"));
        // 与现有启动迁移一致，会话所属用户不在初版表定义中。
        jdbc.execute("ALTER TABLE claude_chat_session ADD COLUMN user_id INTEGER");
        sessions = new ClaudeChatSessionRepository(jdbc);
        paths = new SessionProjectDirectoryRepository(jdbc);
        copies = new SessionCopyRepository(jdbc);
        sessions.insert(ClaudeChatSession.builder().id("source").cwd("D:/work/project").title("开发")
                .engine("codex").codexHome("C:/test/.codex").sdkSessionId("native-history")
                .authToken("test-only-secret").apiBaseUrl("https://gateway.example")
                .selectedModel("model").codexReasoningEffort("high").codexSpeed("fast")
                .executionPolicy("standard").status(SessionStatus.RUNNING).build());
        sessions.updateGroup("source", "项目", "需求");
        paths.replace("source", List.of("D:/work/related"), 1L);
    }

    @AfterEach
    void close() {
        dataSource.destroy();
    }

    private SessionConfigurationCopyService service(SessionCopyRepository receipts) {
        return new SessionConfigurationCopyService(sessions, receipts, new AuthSessionLinkRepository(jdbc),
                new SessionProjectDirectoryService(sessions, paths, mock(WorkspaceScanService.class), mock(ProjectDependencyService.class)),
                new ClaudeChatSessionAccessPolicy(sessions), new DataSourceTransactionManager(dataSource),
                new ClaudeSessionOptionsService(new com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSettingRepository(jdbc), new com.fasterxml.jackson.databind.ObjectMapper()));
    }

    @Test
    void copyDoesNotNeedEngineAndLostResponseSurvivesServiceRecreation() throws Exception {
        var options = new ClaudeSessionOptionsService(new com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSettingRepository(jdbc), new com.fasterxml.jackson.databind.ObjectMapper());
        options.save("source", new com.exceptioncoder.toolbox.claudechat.api.dto.ClaudeSessionOptions("max", true));
        String request = UUID.randomUUID().toString();
        var first = service(copies).copy("source", request);
        var copy = sessions.findById(first.targetSessionId()).orElseThrow();
        assertThat(copy.getSdkSessionId()).isNull();
        assertThat(copy.getStatus()).isEqualTo(SessionStatus.IDLE);
        assertThat(copy.getSelectedModel()).isEqualTo("model");
        assertThat(options.get(copy.getId())).isEqualTo(new com.exceptioncoder.toolbox.claudechat.api.dto.ClaudeSessionOptions("max", true));
        assertThat(options.get("other-session")).isEqualTo(com.exceptioncoder.toolbox.claudechat.api.dto.ClaudeSessionOptions.DEFAULT);
        assertThat(copy.getAuthToken()).isEqualTo("test-only-secret");
        assertThat(copy.getGroupName()).isEqualTo("项目");
        assertThat(copy.getSubgroupName()).isEqualTo("需求");
        assertThat(paths.findPaths(copy.getId())).containsExactly("D:/work/related");
        assertThat(new AuthSessionLinkRepository(jdbc).lineageOf(copy.getId())).contains(copy.getId());
        // 新 Service 模拟进程重启后的回执查找，HTTP 响应仅包含身份，不带网关 Token。
        var mvc = MockMvcBuilders.standaloneSetup(new SessionCopyController(service(copies))).build();
        mvc.perform(post("/api/claude-chat/sessions/source/copy").contentType("application/json")
                .content("{\"requestId\":\"" + request + "\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.targetSessionId").value(copy.getId()))
                .andExpect(jsonPath("$.authToken").doesNotExist());
        assertThat(sessions.findAll()).hasSize(2);
        assertThat(sessions.findById("source").orElseThrow().getStatus()).isEqualTo(SessionStatus.RUNNING);
        jdbc.update("DELETE FROM claude_chat_session WHERE id = ?", "source");
        assertThat(service(copies).copy("source", request).targetSessionId()).isEqualTo(copy.getId());
    }

    @Test
    void failedReceiptRollsBackConfigurationDirectoriesAndAuthLink() {
        SessionCopyRepository failing = spy(copies);
        doThrow(new IllegalStateException("模拟回执保存失败")).when(failing)
                .insert(anyString(), anyString(), anyString(), anyString(), anyLong());
        String request = UUID.randomUUID().toString();
        assertThatThrownBy(() -> service(failing).copy("source", request)).hasMessageContaining("回执保存失败");
        assertThat(sessions.findAll()).hasSize(1);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM claude_chat_session_project_directory", Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM claude_chat_auth_session_link", Integer.class)).isZero();
        assertThat(copies.find("local", request)).isEmpty();
        service(copies).copy("source", request);
        assertThat(sessions.findAll()).hasSize(2);
    }

    @Test
    void deletedTargetCannotBeRecreatedAndInaccessibleSourceCannotBeCopied() {
        var service = service(copies);
        String request = UUID.randomUUID().toString();
        String target = service.copy("source", request).targetSessionId();
        assertThatThrownBy(() -> service.copy("another-source", request)).isInstanceOfSatisfying(
                ResponseStatusException.class, error -> assertThat(error.getStatusCode().value()).isEqualTo(409));
        jdbc.update("DELETE FROM claude_chat_session WHERE id = ?", target);
        assertThatThrownBy(() -> service.copy("source", request)).isInstanceOfSatisfying(
                ResponseStatusException.class, error -> assertThat(error.getStatusCode().value()).isEqualTo(410));
        assertThat(sessions.findAll()).hasSize(1);
        jdbc.update("UPDATE claude_chat_session SET user_id = 99 WHERE id = ?", "source");
        assertThatThrownBy(() -> service.copy("source", UUID.randomUUID().toString())).isInstanceOfSatisfying(
                ResponseStatusException.class, error -> assertThat(error.getStatusCode().value()).isEqualTo(403));
        assertThat(sessions.findAll()).hasSize(1);
    }
}
