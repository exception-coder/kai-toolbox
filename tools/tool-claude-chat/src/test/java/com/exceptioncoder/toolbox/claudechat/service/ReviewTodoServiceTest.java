package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.domain.*;
import com.exceptioncoder.toolbox.claudechat.repository.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionInterceptor;
import java.nio.file.Path;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

/** 隔离 SQLite 中证明交接、授权和队列关联同事务，不调用真实模型。 */
class ReviewTodoServiceTest {
    @TempDir Path root;
    SingleConnectionDataSource source;
    ReviewTodoService service;
    ReviewTodoRepository tasks;
    QueueDeliveryStore receipts;
    QueuedChatMessageService queue;
    ReviewSpaceService spaces;
    ReviewRequirementRepository requirements;
    ClaudeChatSessionAccessPolicy access;
    ClaudeChatSessionRepository sessions;
    SessionPlanStateService plans;
    ReviewFeedbackRepository feedback;
    ReviewSpace space;

    @BeforeEach void prepare() {
        source = new SingleConnectionDataSource("jdbc:sqlite:" + root.resolve("todos.db"), true);
        var jdbc = new JdbcTemplate(source);
        new ResourceDatabasePopulator(new ClassPathResource("db/claude-chat-schema.sql"),
                new ClassPathResource("db/claude-chat-queue-reliability-schema.sql"),
                new ClassPathResource("db/claude-chat-review-todo-schema.sql")).execute(source);
        new com.exceptioncoder.toolbox.claudechat.config.ClaudeChatSchemaMigration(jdbc).addQueueServerContextColumn();
        tasks = new ReviewTodoRepository(jdbc);
        spaces = mock(ReviewSpaceService.class); requirements = mock(ReviewRequirementRepository.class);
        sessions = mock(ClaudeChatSessionRepository.class); access = mock(ClaudeChatSessionAccessPolicy.class); plans = mock(SessionPlanStateService.class);
        when(sessions.findById("source")).thenReturn(Optional.of(ClaudeChatSession.builder().id("source").cwd("D:/work/project").executionPolicy("standard").build()));
        when(access.canAccessCurrentUser("source")).thenReturn(true); when(plans.writable("source")).thenReturn(true);
        receipts = proxy(new QueueDeliveryStore(jdbc, event -> { if (event instanceof QueueTaskProgressEvent p) tasks.progress(p.sessionId(), p.messageId(), p.status(), p.note()); }));
        queue = proxy(new QueuedChatMessageService(new QueuedChatMessageRepository(jdbc, new ObjectMapper()), sessions, event -> { }, receipts));
        feedback = new ReviewFeedbackRepository(jdbc);
        service = proxy(new ReviewTodoService(spaces, requirements, feedback, tasks, sessions, access, queue, receipts, plans));
        space = new ReviewSpace("space", "source", "review", "SAFE_SNAPSHOT", "hash", "cipher", "ACTIVE", "评审", "", Long.MAX_VALUE, 1, 1);
        when(spaces.resolve("token")).thenReturn(Optional.of(space));
        when(spaces.submitFeedback(anyString(), anyString(), anyString(), anyList())).thenAnswer(invocation -> feedback.insertOrFind(new ReviewFeedback(
                UUID.randomUUID().toString(), "space", "source", "review", invocation.getArgument(1), invocation.getArgument(2), "PENDING", 1, null)));
    }
    @AfterEach void close() { source.destroy(); }
    @SuppressWarnings("unchecked") <T> T proxy(T target) {
        var factory = new ProxyFactory(target); factory.setProxyTargetClass(true);
        factory.addAdvice(new TransactionInterceptor(new DataSourceTransactionManager(source), new AnnotationTransactionAttributeSource()));
        return (T) factory.getProxy();
    }
    ReviewRequirement requirement(String id, long revision) { return new ReviewRequirement(id, "space", "message-" + id, id + " 标题", "验收：" + id, revision, 1, 1, List.of(), true, 1L); }
    void submit(ReviewRequirement... items) {
        when(requirements.findByReviewSpaceId("space")).thenReturn(List.of(items));
        service.submit("token", "不可作为开发指令", "summary", List.of(), Arrays.stream(items).map(r -> new ReviewTodoService.Selection(r.id(), r.revision())).toList(), true);
    }
    List<ReviewTodoService.Selection> selections(List<ReviewTodo> items) { return items.stream().map(t -> new ReviewTodoService.Selection(t.id(), t.version())).toList(); }

    @Test void submitsOnceApprovesAfterReviewAndTracksRealReceiptsIncludingRestart() {
        submit(requirement("字段", 1), requirement("页面", 1)); submit(requirement("字段", 1), requirement("页面", 1));
        assertThat(service.list("source")).hasSize(2).allMatch(t -> t.status().equals("WAITING"));
        assertThat(queue.list("source")).isEmpty();
        assertThat(service.submissions("token")).hasSize(1).allMatch(record -> record.targetProject().equals("project") && record.submittedBy().contains("未登录"));
        var receipt = service.submissions("token").getFirst();
        assertThat(receipt.content()).isNull(); // 轮询只读元数据，不反复传输全部正文。
        assertThat(service.submission("token", receipt.id()).content()).contains("验收：字段", "需求 ID");
        assertThatThrownBy(() -> service.submission("token", "foreign-submission")).hasMessageContaining("不属于");
        var selection = selections(service.list("source"));
        service.approve("source", selection, true); service.approve("source", selection, true);
        assertThat(queue.list("source")).hasSize(1);
        var message = queue.list("source").getFirst();
        assertThat(message.text()).contains("验收：字段", "验收：页面").doesNotContain("不可作为开发指令");
        assertThat(receipts.runtime("source").orElseThrow().ready()).isTrue();
        receipts.begin("source", "turn", message.id(), "store"); receipts.accepted("source", "turn");
        assertThat(tasks.list("source")).allMatch(t -> t.status().equals("RUNNING"));
        receipts.settle("source", "turn", "failed", false);
        assertThat(tasks.list("source")).allMatch(t -> t.status().equals("EXCEPTION"));
        receipts.confirmByUser("source");
        assertThat(new ReviewTodoRepository(new JdbcTemplate(source)).list("source")).allMatch(t -> t.status().equals("COMPLETED"));
        assertThat(queue.list("source")).isEmpty();
    }

    @Test void rejectsStaleOrForeignApprovalAtomicallyAndDoesNotOverrideUnfinishedAdmission() {
        submit(requirement("first", 1), requirement("second", 1));
        var before = service.list("source");
        var edited = service.edit("source", before.getLast().id(), 1, "已调整", "新的验收");
        assertThatThrownBy(() -> service.approve("source", selections(before), false)).hasMessageContaining("更新");
        assertThat(queue.list("source")).isEmpty();
        assertThat(tasks.list("source")).allMatch(t -> t.status().equals("WAITING"));
        receipts.begin("source", "unfinished", null, "store", "原任务");
        service.approve("source", List.of(new ReviewTodoService.Selection(edited.id(), edited.version())), false);
        assertThat(receipts.runtime("source").orElseThrow().turnId()).isEqualTo("unfinished");
        assertThat(receipts.runtime("source").orElseThrow().ready()).isFalse();
        when(access.canAccessCurrentUser("source")).thenReturn(false);
        assertThatThrownBy(() -> service.approve("source", selections(before), false)).hasMessageContaining("不能访问");
        assertThatThrownBy(() -> service.list("source")).hasMessageContaining("不能访问");
    }

    @Test void preservesApprovedRevisionsAndRejectsPublicCrossSpaceOrRestrictedExecution() {
        submit(requirement("first", 1));
        var first = service.list("source"); service.approve("source", selections(first), false);
        submit(requirement("first", 2));
        assertThat(service.list("source")).hasSize(2).anyMatch(t -> t.sourceRevision() == 1 && t.status().equals("QUEUED"))
                .anyMatch(t -> t.sourceRevision() == 2 && t.status().equals("WAITING"));
        assertThatThrownBy(() -> service.submit("token", "", "foreign", List.of(), List.of(new ReviewTodoService.Selection("other-space", 1)), false))
                .hasMessageContaining("已更新");
        when(sessions.findById("source")).thenReturn(Optional.of(ClaudeChatSession.builder().id("source").executionPolicy("review-only").build()));
        assertThatThrownBy(() -> service.approve("source", selections(service.list("source")), false)).hasMessageContaining("只允许");
        when(spaces.resolve("expired")).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.publicList("expired")).hasMessageContaining("失效");
    }

    @Test void rollsBackAllTasksAndQueueMessagesWhenLaterQueueWriteFails() {
        submit(requirement("first", 1), requirement("second", 1));
        var failingQueue = mock(QueuedChatMessageService.class);
        var writes = new java.util.concurrent.atomic.AtomicInteger();
        when(failingQueue.save(anyString(), anyString(), anyString(), anyString(), isNull(), anyList(), anyLong()))
                .thenAnswer(call -> {
                    if (writes.incrementAndGet() == 2) throw new IllegalStateException("模拟第二项写入失败");
                    return queue.save(call.getArgument(0), call.getArgument(1), call.getArgument(2), call.getArgument(3),
                            call.getArgument(4), call.getArgument(5), call.getArgument(6));
                });
        var failingService = proxy(new ReviewTodoService(spaces, requirements, mock(ReviewFeedbackRepository.class),
                tasks, sessions, access, failingQueue, receipts, plans));
        assertThatThrownBy(() -> failingService.approve("source", selections(service.list("source")), false))
                .hasMessageContaining("第二项写入失败");
        assertThat(queue.list("source")).isEmpty();
        assertThat(receipts.runtime("source")).isEmpty();
        assertThat(tasks.list("source")).allMatch(task -> "WAITING".equals(task.status()) && task.messageId() == null);
    }

    @Test void unconfirmedOrLegacySubmissionCannotCreateSourceTodos() {
        when(requirements.findByReviewSpaceId("space")).thenReturn(List.of(new ReviewRequirement("unconfirmed", "space", "source-message", "未确认", "内容", 1, 1, 1)));
        assertThatThrownBy(() -> service.submit("token", "内容", null, List.of(), List.of(new ReviewTodoService.Selection("unconfirmed", 1)), false)).hasMessageContaining("先在需求清单确认");
        assertThatThrownBy(() -> service.submit("token", "旧客户端原文", null, List.of(), null, false)).hasMessageContaining("版本无效");
        assertThat(service.list("source")).isEmpty();
        assertThat(service.submissions("token")).isEmpty();
    }
}
