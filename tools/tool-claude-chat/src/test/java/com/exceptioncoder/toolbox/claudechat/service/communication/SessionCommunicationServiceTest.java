package com.exceptioncoder.toolbox.claudechat.service.communication;

import com.exceptioncoder.toolbox.claudechat.api.SessionCommunicationController;
import com.exceptioncoder.toolbox.claudechat.config.ClaudeChatProperties;
import com.exceptioncoder.toolbox.claudechat.domain.ClaudeChatSession;
import com.exceptioncoder.toolbox.claudechat.domain.communication.CommunicationRecord.*;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatAttachmentRepository;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import com.exceptioncoder.toolbox.claudechat.repository.communication.SessionCommunicationRepository;
import com.exceptioncoder.toolbox.claudechat.service.AttachmentStorageService;
import com.exceptioncoder.toolbox.claudechat.service.ClaudeChatSessionAccessPolicy;
import com.exceptioncoder.toolbox.claudechat.service.SessionPlanStateService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.server.ResponseStatusException;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Base64;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class SessionCommunicationServiceTest {
    private static final String SESSION = "session-a";
    private static final String OTHER = "session-b";
    private static final Filter LATEST = new Filter("", "desc", "all", false, 0);
    private static final byte[] PNG = Base64.getDecoder().decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j7n0AAAAASUVORK5CYII=");
    @TempDir Path temp;
    private SessionCommunicationRepository repository;
    private SessionCommunicationService service;
    private AttachmentStorageService attachments;
    private ClaudeChatSessionAccessPolicy access;
    private SessionPlanStateService plans;
    private JdbcTemplate jdbc;
    private MockMvc http;
    private final ObjectMapper mapper = new ObjectMapper();

    @BeforeEach
    void initializeRealSqliteAndOwnedAttachmentStorage() {
        var dataSource = new DriverManagerDataSource("jdbc:sqlite:" + temp.resolve("journal.db"));
        var initializer = new ResourceDatabasePopulator(new ClassPathResource("db/claude-chat-schema.sql"),
                new ClassPathResource("db/claude-chat-communication-schema.sql"));
        initializer.execute(dataSource);
        initializer.execute(dataSource);
        jdbc = new JdbcTemplate(dataSource);
        repository = new SessionCommunicationRepository(jdbc, mapper);
        var sessions = mock(ClaudeChatSessionRepository.class);
        for (String sid : List.of(SESSION, OTHER)) {
            when(sessions.findById(sid)).thenReturn(Optional.of(ClaudeChatSession.builder().id(sid).cwd(temp.toString()).build()));
        }
        attachments = new AttachmentStorageService(new ClaudeChatProperties(), sessions, new ClaudeChatAttachmentRepository(jdbc));
        access = mock(ClaudeChatSessionAccessPolicy.class);
        when(access.canAccessCurrentUser(anyString())).thenReturn(true);
        when(access.canAccessOrClaimCurrentUser(anyString())).thenReturn(true);
        plans = mock(SessionPlanStateService.class);
        when(plans.writable(anyString())).thenReturn(true);
        service = new SessionCommunicationService(repository, attachments, access, plans);
        http = MockMvcBuilders.standaloneSetup(new SessionCommunicationController(service)).build();
    }

    @Test
    void retriesReuseIdentityAndVersionConflictDoesNotOverwrite() {
        String id = UUID.randomUUID().toString();
        Input first = input("原始沟通", 100, "  原文\n", "", List.of(), 0);
        assertThat(service.save(SESSION, id, first).record().version()).isEqualTo(1);
        assertThat(service.save(SESSION, id, first).record().version()).isEqualTo(1);
        assertThat(service.list(SESSION, LATEST).total()).isEqualTo(1);
        assertThat(service.detail(SESSION, id).record().originalText()).isEqualTo("  原文\n");
        service.save(SESSION, id, input("补充备注", 100, "原文", "用户整理", List.of(), 1));
        assertThatThrownBy(() -> service.save(SESSION, id, input("旧页面", 100, "原文", "旧备注", List.of(), 1)))
                .isInstanceOf(ResponseStatusException.class).hasMessageContaining("409");
        assertThat(service.detail(SESSION, id).record().notes()).isEqualTo("用户整理");
        assertThat(service.list(OTHER, LATEST).total()).isZero();
    }

    @Test
    void scopesSearchPaginatesAndReversesCommunicationTime() {
        for (int i = 1; i <= 25; i++) repository.insert(SESSION, UUID.randomUUID().toString(),
                input("沟通 " + i, i, "库存标签\n" + "长文".repeat(1000), i % 2 == 0 ? "待核实" : "", List.of(), 0));
        repository.insert(OTHER, UUID.randomUUID().toString(), input("另一个会话", 100, "库存标签", "", List.of(), 0));
        var page = service.list(SESSION, LATEST);
        assertThat(page.total()).isEqualTo(25);
        assertThat(page.records()).hasSize(20);
        assertThat(page.records().getFirst().occurredAt()).isEqualTo(25);
        assertThat(page.records().getFirst().excerpt()).hasSize(280);
        assertThat(service.list(SESSION, new Filter("库存标签", "asc", "with", false, 0)).total()).isEqualTo(12);
        assertThat(service.list(SESSION, new Filter("", "desc", "all", false, 1)).records()).hasSize(5);
        var explain = jdbc.queryForList("EXPLAIN QUERY PLAN SELECT id FROM claude_chat_communication_record WHERE session_id = ? AND deleted_at IS NULL ORDER BY occurred_at DESC, id DESC LIMIT 20", SESSION);
        assertThat(explain.toString()).contains("idx_cc_communication_session_time");
    }

    @Test
    void removesRestoresAndClearsOnlyTheParentSession() {
        String id = UUID.randomUUID().toString();
        service.save(SESSION, id, input("确认过程", 100, "保存", "", List.of(), 0));
        service.save(OTHER, UUID.randomUUID().toString(), input("保留", 100, "另一个会话", "", List.of(), 0));
        service.setRemoved(SESSION, id, 1, true);
        assertThat(service.list(SESSION, LATEST).total()).isZero();
        assertThat(service.list(SESSION, new Filter("", "desc", "all", true, 0)).total()).isEqualTo(1);
        assertThatThrownBy(() -> service.reference(SESSION, List.of(id))).hasMessageContaining("移除");
        assertThatThrownBy(() -> service.setRemoved(SESSION, id, 1, false)).hasMessageContaining("409");
        service.setRemoved(SESSION, id, 2, false);
        assertThat(service.detail(SESSION, id).record().originalText()).isEqualTo("保存");
        repository.deleteBySession(SESSION);
        assertThat(service.list(SESSION, LATEST).total()).isZero();
        assertThat(service.list(OTHER, LATEST).total()).isEqualTo(1);
    }

    @Test
    void restrictsImagesToSessionAndRecordAndReferencesMultipleRecords() throws Exception {
        var image = attachments.store(SESSION, new MockMultipartFile("file", "screen.png", "image/png", PNG));
        String first = UUID.randomUUID().toString(), second = UUID.randomUUID().toString();
        service.save(SESSION, first, input("截图说明", 100, "", "保存前", List.of(image.id()), 0));
        service.save(SESSION, second, input("后续讨论", 200, "保存后确认", "", List.of(image.id()), 0));
        var material = service.reference(SESSION, List.of(first, second));
        assertThat(material.records()).extracting(row -> row.id()).containsExactly(first, second);
        assertThat(material.attachments()).hasSize(1);
        assertThatThrownBy(() -> service.save(OTHER, UUID.randomUUID().toString(), input("错误关联", 100, "", "", List.of(image.id()), 0)))
                .hasMessageContaining("不属于当前会话");
        http.perform(get(url(first) + "/attachments/" + image.id())).andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store")).andExpect(content().bytes(PNG));
        http.perform(get(url(second) + "/attachments/att_missing")).andExpect(status().isNotFound());
        Files.delete(Path.of(image.path()));
        assertThat(service.detail(SESSION, first).images()).hasSize(1);
        assertThatThrownBy(() -> service.reference(SESSION, List.of(first))).hasMessageContaining("ATTACHMENT_FILE_MISSING");
    }

    @Test
    void httpDeniesOtherUsersAndLockedWritesAndRejectsMalformedInputs() throws Exception {
        String id = UUID.randomUUID().toString();
        when(access.canAccessCurrentUser(SESSION)).thenReturn(false);
        http.perform(get(url(id))).andExpect(status().isForbidden());
        when(access.canAccessOrClaimCurrentUser(SESSION)).thenReturn(false);
        http.perform(put(url(id)).contentType("application/json").content(mapper.writeValueAsBytes(input("合法", 100, "原文", "", List.of(), 0))))
                .andExpect(status().isForbidden());
        when(access.canAccessOrClaimCurrentUser(SESSION)).thenReturn(true);
        when(plans.writable(SESSION)).thenReturn(false);
        http.perform(put(url(id)).contentType("application/json").content(mapper.writeValueAsBytes(input("合法", 100, "原文", "", List.of(), 0))))
                .andExpect(status().isConflict());
        http.perform(multipart("/api/claude-chat/sessions/" + SESSION + "/communications/attachments")
                .file(new MockMultipartFile("file", "screen.png", "image/png", PNG))).andExpect(status().isConflict());
        when(plans.writable(SESSION)).thenReturn(true);
        http.perform(put(url("invalid")).contentType("application/json").content("{}" )).andExpect(status().isBadRequest());
        assertThatThrownBy(() -> service.save(SESSION, id, new Input("标题", 100, "", "", "javascript:alert(1)", "原文", "", List.of(), 0)))
                .hasMessageContaining("400");
        assertThatThrownBy(() -> service.save(SESSION, id, input("标题", 100, "原文", "", java.util.Arrays.asList((String)null), 0)))
                .hasMessageContaining("400");
        when(access.canAccessCurrentUser(SESSION)).thenReturn(true);
        assertThatThrownBy(() -> service.list(SESSION, new Filter("", "desc; DROP TABLE", "all", false, -1)))
                .hasMessageContaining("400");
    }

    @Test
    void rejectsDisguisedImagesAndCapsTotalRecords() throws Exception {
        var fake = attachments.store(SESSION, new MockMultipartFile("file", "fake.png", "image/png", "<svg><script>alert(1)</script></svg>".getBytes()));
        assertThatThrownBy(() -> service.save(SESSION, UUID.randomUUID().toString(), input("截图", 100, "", "", List.of(fake.id()), 0)))
                .hasMessageContaining("真实");
        for (int i = 0; i < SessionCommunicationRepository.MAX_RECORDS; i++) repository.insert(SESSION, UUID.randomUUID().toString(), input("沟通", 100, "原文", "", List.of(), 0));
        assertThatThrownBy(() -> service.save(SESSION, UUID.randomUUID().toString(), input("超过上限", 100, "原文", "", List.of(), 0)))
                .hasMessageContaining("1000");
    }

    private Input input(String title, long time, String original, String notes, List<String> ids, int version) {
        return new Input(title, time, "飞书", "张凯", "", original, notes, ids, version);
    }
    private String url(String id) { return "/api/claude-chat/sessions/" + SESSION + "/communications/" + id; }
}
