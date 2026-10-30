package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.domain.ClaudeChatSession;
import com.exceptioncoder.toolbox.claudechat.domain.QueuedChatMessage;
import com.exceptioncoder.toolbox.claudechat.domain.SessionStatus;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import com.exceptioncoder.toolbox.claudechat.repository.QueueDeliveryStore;
import com.exceptioncoder.toolbox.claudechat.repository.QueuedChatMessageRepository;
import com.exceptioncoder.toolbox.llm.observability.AgentSpan;
import com.exceptioncoder.toolbox.llm.observability.AgentTelemetry;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionInterceptor;
import org.springframework.test.util.ReflectionTestUtils;

import java.nio.file.Path;
import java.util.*;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** 实际 SQLite 事务 + 真实聊天编排；不启动运行服务，也不调用外部模型。 */
class QueueReliabilityTest {
    @TempDir Path root;
    private final Map<Class<?>, Object> deps = new HashMap<>();
    private final ObjectMapper mapper = new ObjectMapper();
    private SingleConnectionDataSource source;
    private JdbcTemplate jdbc;
    private QueueDeliveryStore store;
    private QueuedChatMessageRepository queue;
    private ClaudeChatService chat;

    @BeforeEach
    void prepare() throws Exception {
        source = new SingleConnectionDataSource("jdbc:sqlite:" + root.resolve("queue.db"), true);
        jdbc = new JdbcTemplate(source);
        new ResourceDatabasePopulator(new ClassPathResource("db/claude-chat-schema.sql"),
                new ClassPathResource("db/claude-chat-queue-reliability-schema.sql")).execute(source);
        new com.exceptioncoder.toolbox.claudechat.config.ClaudeChatSchemaMigration(jdbc).addQueueServerContextColumn();
        ProxyFactory factory = new ProxyFactory(new QueueDeliveryStore(jdbc));
        factory.setProxyTargetClass(true);
        factory.addAdvice(new TransactionInterceptor(new DataSourceTransactionManager(source), new AnnotationTransactionAttributeSource()));
        store = (QueueDeliveryStore) factory.getProxy();
        queue = new QueuedChatMessageRepository(jdbc, mapper);
        var repo = mock(ClaudeChatSessionRepository.class);
        var session = ClaudeChatSession.builder().id("s").cwd(root.toString()).engine("codex")
                .sdkSessionId("native-s").status(SessionStatus.IDLE).build();
        when(repo.findById("s")).thenReturn(Optional.of(session));
        deps.put(ClaudeChatSessionRepository.class, repo);
        deps.put(QueueDeliveryStore.class, store);
        deps.put(QueuedChatMessageService.class, new QueuedChatMessageService(queue, repo, event -> {}, store));
        deps.put(AgentWorkAdmissionGate.class, new AgentWorkAdmissionGate());
        deps.put(ObjectMapper.class, mapper);
        createChat();
        when(dep(SidecarClient.class).isConnected()).thenReturn(true);
        when(dep(SessionPlanStateService.class).writable("s")).thenReturn(true);
        when(dep(SessionRuntimeStateService.class).canReleaseQueue("s"))
                .thenReturn(new SessionRuntimeStateService.SendDecision(true, "CONSISTENT", "idle"));
        when(dep(AttachmentStorageService.class).loadImages(anyString(), anyList())).thenReturn(List.of());
        when(dep(AgentTelemetry.class).start(anyString(), any())).thenReturn(mock(AgentSpan.class));
        enqueue("q1", 1); enqueue("q2", 2);
    }
    private void createChat() throws Exception {
        var constructor = ClaudeChatService.class.getConstructors()[0];
        Object[] args = Arrays.stream(constructor.getParameterTypes()).map(type -> deps.computeIfAbsent(type,
                key -> key == List.class ? List.of() : mock(key))).toArray();
        chat = (ClaudeChatService) constructor.newInstance(args);
    }
    @AfterEach void close() { chat.stopRecovery(); source.destroy(); }
    private <T> T dep(Class<T> type) { return type.cast(deps.get(type)); }
    private void enqueue(String id, long created) { queue.upsert(new QueuedChatMessage(id, "s", id, null, null, List.of(), created)); }
    private JsonNode snapshot(String receipt) throws Exception {
        return mapper.readTree("{\"queueReceiptProtocol\":1,\"queueReceiptStoreId\":\"epoch\",\"sessionPresent\":true,\"active\":false,\"receipt\":" + receipt + "}");
    }
    private void state(JsonNode value) {
        when(dep(SidecarClient.class).querySessionState(eq("s"), nullable(String.class), anyLong())).thenReturn(Optional.of(value));
    }
    private void priorSuccess() { store.begin("s", "previous", null, null); store.settle("s", "previous", "end_turn", true); }
    private long sends() { return mockingDetails(dep(SidecarClient.class)).getInvocations().stream()
            .filter(i -> i.getMethod().getName().equals("userMessage")).count(); }
    private String completed(String turn, String reason) {
        return "{\"sessionId\":\"s\",\"turnId\":\"" + turn + "\",\"state\":\"COMPLETED\",\"stopReason\":\"" + reason + "\",\"queueReleaseSafe\":" + reason.equals("end_turn") + "}";
    }

    @Test void lateEnqueueAndRepeatedInspectionDispatchExactlyOneWithoutBrowser() throws Exception {
        priorSuccess(); state(snapshot("null"));
        chat.reconcileQueue("s"); chat.reconcileQueue("s");
        assertThat(sends()).isEqualTo(1);
        assertThat(queue.findBySessionId("s")).hasSize(2); // 没有在发送前删除。
        assertThat(store.delivery("s").orElseThrow().messageId()).isEqualTo("q1");
        assertThat(store.runtime("s").orElseThrow().ready()).isFalse();
    }
    @Test void missedResultIsReconciledThenNextMessageStartsOnlyOnce() throws Exception {
        store.begin("s", "t1", "q1", "epoch");
        state(snapshot(completed("t1", "end_turn")));
        chat.reconcileQueue("s"); chat.reconcileQueue("s");
        assertThat(queue.findBySessionId("s")).extracting(QueuedChatMessage::id).containsExactly("q2");
        assertThat(store.delivery("s").orElseThrow().messageId()).isEqualTo("q2");
        assertThat(sends()).isEqualTo(1);
    }
    @Test void backendRestartRestoresDurableGateWithoutAnyViewer() throws Exception {
        priorSuccess(); state(snapshot("null"));
        chat.stopRecovery(); createChat();
        when(dep(SidecarClient.class).isConnected()).thenReturn(false, false, true);
        when(dep(SidecarClient.class).connectQueueTransport()).thenReturn(true);
        chat.reconcileQueues();
        verify(dep(SidecarClient.class)).connectQueueTransport();
        assertThat(sends()).isEqualTo(1);
    }









    @Test void failedTaskIsAskedAtMostThreeTimesThenUserCanContinue() throws Exception {
        store.begin("s", "t1", "q1", "epoch", "finish q1");
        store.settle("s", "t1", "error", false);
        for (int count = 1; count <= 3; count++) {
            state(snapshot("null")); chat.reconcileQueue("s");
            var runtime = store.runtime("s").orElseThrow();
            assertThat(runtime.checkAttempts()).isEqualTo(count);
            assertThat(runtime.checking()).isTrue();
            // A normal engine stop without the explicit completion answer does not release the next item.
            state(snapshot(completed(runtime.turnId(), "end_turn"))); chat.reconcileQueue("s");
        }
        chat.reconcileQueue("s"); chat.reconcileQueue("s");
        assertThat(sends()).isEqualTo(3);
        assertThat(store.runtime("s").orElseThrow().ready()).isFalse();
        state(snapshot("null")); chat.confirmQueueAndContinue("s");
        chat.reconcileQueue("s");
        assertThat(queue.findBySessionId("s")).extracting(QueuedChatMessage::id).containsExactly("q2");
        assertThat(sends()).isEqualTo(4);
    }
    @Test void clearModelConfirmationReleasesNextWithoutRepeatingOriginalTask() throws Exception {
        store.begin("s", "t1", "q1", "epoch", "finish q1"); store.settle("s", "t1", "error", false);
        state(snapshot("null")); chat.reconcileQueue("s");
        var turn = store.runtime("s").orElseThrow().turnId();
        var value = snapshot(completed(turn, "end_turn"));
        ((com.fasterxml.jackson.databind.node.ObjectNode) value.path("receipt")).put("queueCheckOutcome", "COMPLETED");
        state(value); chat.reconcileQueue("s");
        assertThat(sends()).isEqualTo(2);
        assertThat(queue.findBySessionId("s")).extracting(QueuedChatMessage::id).containsExactly("q2");
    }

}
