package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.ai.ReviewRequirementCompiler;
import com.exceptioncoder.toolbox.claudechat.domain.ReviewSpace;
import com.exceptioncoder.toolbox.claudechat.repository.ReviewRequirementRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionInterceptor;

import java.nio.file.Path;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class ReviewRequirementServiceTest {
    @TempDir Path root;
    SingleConnectionDataSource database;
    ReviewRequirementService service;
    ReviewRequirementCompiler compiler;
    private static final String CONTENT = "## 类型\n优化\n\n## 问题\n占用空间\n\n## 预期行为\n精简布局\n\n## 验收标准\n聊天内容可见";
    @BeforeEach void prepare() {
        database = new SingleConnectionDataSource("jdbc:sqlite:" + root.resolve("review.db"), true);
        new ResourceDatabasePopulator(new ClassPathResource("db/claude-chat-schema.sql")).execute(database);
        var spaces = mock(ReviewSpaceService.class);
        when(spaces.resolve("token")).thenReturn(Optional.of(new ReviewSpace("space", "source", "review", "SAFE_SNAPSHOT", "hash", null, "ACTIVE", "评审", "", Long.MAX_VALUE, 1, 1)));
        compiler = mock(ReviewRequirementCompiler.class);
        var factory = new ProxyFactory(new ReviewRequirementService(spaces, new ReviewRequirementRepository(new JdbcTemplate(database)), compiler));
        factory.setProxyTargetClass(true);
        factory.addAdvice(new TransactionInterceptor(new DataSourceTransactionManager(database), new AnnotationTransactionAttributeSource()));
        service = (ReviewRequirementService) factory.getProxy();
    }
    @AfterEach void close() { database.destroy(); }
    ReviewRequirementService.DraftCommand draft(String id) { return new ReviewRequirementService.DraftCommand("assistant-content-v1:" + id, id, CONTENT, "原话" + id, "分析" + id); }

    @Test void addsOnlyExplicitCandidatesAndNeverLetsModelOverwriteExistingContent() {
        var first = service.synchronize("token", List.of(draft("一"))).getFirst();
        service.confirm("token", first.id(), first.revision(), true);
        service.synchronize("token", List.of(draft("一"), draft("二")));
        assertThat(service.list("token")).hasSize(2).anyMatch(item -> item.id().equals(first.id()) && item.confirmed());
        assertThat(service.backlog("token").processedSources()).hasSize(2);
        verifyNoInteractions(compiler);
    }
    @Test void editInvalidatesConfirmationAndStaleConfirmationCannotApproveNewContent() {
        var item = service.synchronize("token", List.of(draft("一"))).getFirst();
        assertThat(item.confirmed()).isFalse();
        var confirmed = service.confirm("token", item.id(), 1, true);
        assertThat(confirmed.confirmedAt()).isNotNull();
        var edited = service.update("token", item.id(), new ReviewRequirementService.UpdateCommand("修订", CONTENT, 1));
        assertThat(edited.confirmed()).isFalse();
        assertThat(edited.createdAt()).isEqualTo(item.createdAt());
        assertThatThrownBy(() -> service.confirm("token", item.id(), 1, true)).hasMessageContaining("已更新");
        assertThat(service.confirm("token", item.id(), 2, true).confirmed()).isTrue();
        assertThat(service.confirm("token", item.id(), 2, false).confirmed()).isFalse();
    }
    @Test void explicitMergeRetainsBothSourcesAndRequiresNewConfirmation() {
        var items = service.synchronize("token", List.of(draft("一"), draft("二")));
        var target = items.getFirst(); var source = items.getLast();
        service.confirm("token", target.id(), 1, true);
        var result = service.merge("token", target.id(), source.id(), 1, 1, "合并后", CONTENT).getFirst();
        assertThat(service.list("token")).hasSize(1);
        assertThat(result.sources()).hasSize(2);
        assertThat(result.confirmed()).isFalse();
        assertThat(result.revision()).isEqualTo(2);
        assertThatThrownBy(() -> service.merge("token", target.id(), "foreign", 2, 1, "不能串空间", CONTENT)).hasMessageContaining("不属于");
    }
    @Test void rejectsDestructiveRebuildAndIncompleteConfirmation() {
        var item = service.synchronize("token", List.of(draft("一"))).getFirst();
        assertThatThrownBy(() -> service.rebuild("token", List.of())).hasMessageContaining("不再清空");
        service.update("token", item.id(), new ReviewRequirementService.UpdateCommand("旧说明", "仅有说明", 1));
        assertThatThrownBy(() -> service.confirm("token", item.id(), 2, true)).hasMessageContaining("补全");
        assertThat(service.list("token")).hasSize(1);
    }
    @Test void invalidBatchRollsBackEarlierAdditionAndExpiredTokenIsRejected() {
        assertThatThrownBy(() -> service.synchronize("token", List.of(draft("一"), new ReviewRequirementService.DraftCommand("invalid", "标题", CONTENT)))).hasMessageContaining("来源");
        assertThat(service.list("token")).isEmpty();
        assertThatThrownBy(() -> service.list("expired")).hasMessageContaining("失效");
    }
}
