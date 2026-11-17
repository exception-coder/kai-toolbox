package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import com.exceptioncoder.toolbox.claudechat.domain.ClaudeChatSession;
import com.exceptioncoder.toolbox.claudechat.repository.EngineHandoffRepository;
import com.exceptioncoder.toolbox.common.assistant.AssistantCapabilityPort.ConversationMessage;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionInterceptor;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.sqlite.SQLiteConfig;
import org.sqlite.SQLiteDataSource;

import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

/** 文件型 WAL + 真实 Spring 代理，内存单连接测试无法覆盖读快照升级冲突。 */
class EngineHandoffConcurrencyTest {
    @TempDir Path root;
    SQLiteDataSource dataSource;
    JdbcTemplate jdbc;
    EngineHandoffRepository repository;
    DataSourceTransactionManager transactions;
    final ClaudeChatSessionRepository sessions = mock(ClaudeChatSessionRepository.class);
    final ClaudeChatConversationDeltaReader history = mock(ClaudeChatConversationDeltaReader.class);

    @BeforeEach
    void setup() throws Exception {
        var config = new SQLiteConfig();
        config.setJournalMode(SQLiteConfig.JournalMode.WAL);
        config.setBusyTimeout(1000);
        config.enforceForeignKeys(true);
        dataSource = new SQLiteDataSource(config);
        dataSource.setUrl("jdbc:sqlite:" + root.resolve("handoff.db"));
        jdbc = new JdbcTemplate(dataSource);
        transactions = new DataSourceTransactionManager(dataSource);
        jdbc.execute("CREATE TABLE claude_chat_session(id TEXT PRIMARY KEY)");
        jdbc.update("INSERT INTO claude_chat_session VALUES (?)", "session");
        jdbc.execute("CREATE TABLE concurrent_activity(value INTEGER NOT NULL)");
        jdbc.update("INSERT INTO concurrent_activity VALUES (0)");
        try (var input = getClass().getResourceAsStream("/db/claude-chat-handoff-schema.sql")) {
            for (String statement : new String(java.util.Objects.requireNonNull(input).readAllBytes(),
                    StandardCharsets.UTF_8).split(";")) {
                if (!statement.isBlank()) jdbc.execute(statement);
            }
        }
        repository = new EngineHandoffRepository(jdbc);
    }

    private EngineHandoffService service() {
        var target = new EngineHandoffService(repository, sessions, history, new ObjectMapper(), transactions,
                root.resolve("evidence"));
        var proxy = new ProxyFactory(target);
        proxy.setProxyTargetClass(true);
        proxy.addAdvice(new TransactionInterceptor(transactions, new AnnotationTransactionAttributeSource()));
        return (EngineHandoffService) proxy.getProxy();
    }

    @Test
    void concurrentWriteDuringHistoryReadDoesNotInvalidateImportSnapshot() {
        var historyInTransaction = new AtomicBoolean();
        when(history.readForHandoff("session")).thenAnswer(call -> {
            historyInTransaction.set(TransactionSynchronizationManager.isActualTransactionActive());
            try (var writer = dataSource.getConnection(); var statement = writer.createStatement()) {
                statement.executeUpdate("UPDATE concurrent_activity SET value = value + 1");
            }
            return new ClaudeChatConversationDeltaReader.ConversationRead(
                    List.of(new ConversationMessage(1, "user", "原始目标")), List.of());
        });
        var service = service();
        assertThat(service.initialize("session").status).isEqualTo("IDLE");
        assertThat(historyInTransaction).isFalse();
        assertThat(repository.messages("session", 0)).extracting(EngineHandoffRepository.Entry::content)
                .containsExactly("原始目标");
        assertThat(jdbc.queryForObject("SELECT value FROM concurrent_activity", Integer.class)).isEqualTo(1);
        service.initialize("session");
        verify(history, times(1)).readForHandoff("session");
    }

    @Test
    void prepareAlsoReadsHistoryOutsideAnAmbientTransaction() {
        when(history.readForHandoff("session")).thenAnswer(call -> {
            assertThat(TransactionSynchronizationManager.isActualTransactionActive()).isFalse();
            try (var writer = dataSource.getConnection(); var statement = writer.createStatement()) {
                statement.executeUpdate("UPDATE concurrent_activity SET value = value + 1");
            }
            return new ClaudeChatConversationDeltaReader.ConversationRead(
                    List.of(new ConversationMessage(1, "user", "原始目标")), List.of());
        });
        var session = ClaudeChatSession.builder().id("session").engine("codex").cwd(root.toString()).build();
        var service = service();
        var ambient = new org.springframework.transaction.support.TransactionTemplate(transactions);
        var prepared = ambient.execute(status -> service.prepare(session, "claude", null));
        assertThat(prepared.status).isEqualTo("PREPARING");
        assertThat(prepared.prompt).contains("原始目标");
    }

    @Test
    void simultaneousInitializersRecheckStateAfterObtainingWriteReservation() throws Exception {
        var readers = new CountDownLatch(2);
        when(history.readForHandoff("session")).thenAnswer(call -> {
            readers.countDown();
            assertThat(readers.await(5, TimeUnit.SECONDS)).isTrue();
            return new ClaudeChatConversationDeltaReader.ConversationRead(
                    List.of(new ConversationMessage(1, "user", "同一条历史")), List.of());
        });
        var first = service();
        var second = service();
        try (var executor = Executors.newFixedThreadPool(2)) {
            var one = executor.submit(() -> first.initialize("session"));
            var two = executor.submit(() -> second.initialize("session"));
            assertThat(one.get(10, TimeUnit.SECONDS).status).isEqualTo("IDLE");
            assertThat(two.get(10, TimeUnit.SECONDS).status).isEqualTo("IDLE");
        }
        assertThat(repository.messages("session", 0)).hasSize(1);
    }

    @Test
    void failedImportRollsBackBothMessagesAndInitializationState() {
        when(history.readForHandoff("session")).thenReturn(
                new ClaudeChatConversationDeltaReader.ConversationRead(List.of(
                        new ConversationMessage(1, "user", "第一条"),
                        new ConversationMessage(2, "assistant", "第二条")), List.of()));
        repository = spy(repository);
        doThrow(new IllegalStateException("模拟落库失败")).when(repository)
                .append("session", "import:2", "legacy", "assistant", "第二条");
        assertThatThrownBy(() -> service().initialize("session")).hasMessage("模拟落库失败");
        assertThat(repository.state("session")).isEmpty();
        assertThat(repository.messages("session", 0)).isEmpty();
    }
}
