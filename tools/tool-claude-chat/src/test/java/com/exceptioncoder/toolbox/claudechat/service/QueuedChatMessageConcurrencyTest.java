package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.domain.ClaudeChatSession;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import com.exceptioncoder.toolbox.claudechat.repository.QueuedChatMessageRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionInterceptor;
import org.sqlite.SQLiteConfig;
import org.sqlite.SQLiteDataSource;

import java.nio.file.Path;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.stream.IntStream;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

class QueuedChatMessageConcurrencyTest {
    @TempDir Path directory;

    @Test
    void concurrentAdmissionsWaitBeforeReadingAndKeepOriginalOnRetry() throws Exception {
        var config = new SQLiteConfig();
        config.setJournalMode(SQLiteConfig.JournalMode.WAL);
        config.setBusyTimeout(5000);
        var dataSource = new SQLiteDataSource(config);
        dataSource.setUrl("jdbc:sqlite:" + directory.resolve("queue.db"));
        var jdbc = new JdbcTemplate(dataSource);
        jdbc.execute("CREATE TABLE claude_chat_queued_message (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, text TEXT NOT NULL, display_text TEXT, developer_instructions TEXT, attachments_json TEXT, created_at INTEGER, server_context TEXT)");
        jdbc.execute("CREATE TABLE claude_chat_queue_retirement (session_id TEXT, message_id TEXT, retired_at INTEGER, PRIMARY KEY(session_id,message_id))");
        var repository = new QueuedChatMessageRepository(jdbc, new ObjectMapper());
        var sessions = mock(ClaudeChatSessionRepository.class);
        when(sessions.findById(anyString())).thenAnswer(invocation -> {
            // Establish a real WAL read snapshot, then allow competing requests to reach their reads.
            jdbc.queryForObject("SELECT count(*) FROM claude_chat_queued_message", Integer.class);
            Thread.sleep(25);
            return Optional.of(mock(ClaudeChatSession.class));
        });
        var proxy = new ProxyFactory(new QueuedChatMessageService(repository, sessions));
        proxy.setProxyTargetClass(true);
        proxy.addAdvice(new TransactionInterceptor(new DataSourceTransactionManager(dataSource),
                new AnnotationTransactionAttributeSource()));
        var service = (QueuedChatMessageService) proxy.getProxy();
        var start = new CountDownLatch(1);
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var results = IntStream.range(0, 12).mapToObj(index -> executor.submit(() -> {
                start.await();
                return service.save("session", "message-" + index, "original", null, null, List.of(), 1L);
            })).toList();
            start.countDown();
            for (var result : results) assertEquals("original", result.get(10, TimeUnit.SECONDS).text());
        }
        assertEquals(12, repository.findBySessionId("session").size());
        assertEquals("original", service.save("session", "message-0", "replacement", null, null, List.of(), 2L).text());
        repository.delete("session", "message-0");
        assertThrows(IllegalStateException.class,
                () -> service.save("session", "message-0", "revive", null, null, List.of(), 3L));
        assertEquals(11, repository.findBySessionId("session").size());
    }
}
