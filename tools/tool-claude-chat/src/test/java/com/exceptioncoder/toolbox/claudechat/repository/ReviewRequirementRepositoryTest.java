package com.exceptioncoder.toolbox.claudechat.repository;

import com.exceptioncoder.toolbox.claudechat.domain.ReviewRequirement;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;

import static org.assertj.core.api.Assertions.assertThat;

/** 需求清单与多来源证据的 SQLite 持久化测试。 */
class ReviewRequirementRepositoryTest {
    private ReviewRequirementRepository repository;

    @BeforeEach
    void setUp() {
        SingleConnectionDataSource dataSource = new SingleConnectionDataSource("jdbc:sqlite::memory:", true);
        JdbcTemplate jdbc = new JdbcTemplate(dataSource);
        jdbc.execute("""
                CREATE TABLE claude_chat_review_requirement (
                    id TEXT PRIMARY KEY,
                    review_space_id TEXT NOT NULL,
                    source_message_id TEXT NOT NULL,
                    title TEXT NOT NULL,
                    content TEXT NOT NULL,
                    status TEXT NOT NULL,
                    revision INTEGER NOT NULL,
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL,
                    UNIQUE (review_space_id, source_message_id)
                )
                """);
        jdbc.execute("""
                CREATE TABLE claude_chat_review_requirement_source (
                    id TEXT PRIMARY KEY,
                    review_space_id TEXT NOT NULL,
                    requirement_id TEXT,
                    source_message_id TEXT NOT NULL,
                    source_text TEXT NOT NULL,
                    analysis_text TEXT NOT NULL,
                    operation TEXT NOT NULL,
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL,
                    UNIQUE (review_space_id, source_message_id)
                )
                """);
        repository = new ReviewRequirementRepository(jdbc);
    }

    @Test
    void attachesMultipleSourcesToOneCurrentRequirement() {
        String requirementId = repository.insertRequirement("space-1",
                new ReviewRequirementRepository.Draft(
                        "assistant-content-v1:first", "移动端空间优化", "完整说明"), 10);
        repository.insertSource("space-1", requirementId,
                new ReviewRequirementRepository.Source(
                        "assistant-content-v1:first", "顶部太高", "整理首轮需求", "CREATE"), 10);
        repository.insertSource("space-1", requirementId,
                new ReviewRequirementRepository.Source(
                        "assistant-content-v1:second", "只改红框区域", "补充范围", "MERGE"), 20);

        ReviewRequirement requirement = repository.findByReviewSpaceId("space-1").getFirst();

        assertThat(requirement.sources()).extracting(ReviewRequirement.Source::sourceText)
                .containsExactly("顶部太高", "只改红框区域");
        assertThat(repository.hasProcessedSource("space-1", "assistant-content-v1:second")).isTrue();
    }

    @Test
    void automaticCompilationDoesNotOverwriteManualRevision() {
        String requirementId = repository.insertRequirement("space-1",
                new ReviewRequirementRepository.Draft(
                        "assistant-content-v1:first", "初稿", "初稿说明"), 10);
        assertThat(repository.update("space-1", requirementId,
                new ReviewRequirementRepository.Update("人工标题", "人工说明", 1), 20)).isTrue();

        boolean changed = repository.updateCompiled(
                "space-1", requirementId, "AI 标题", "AI 说明", 30);

        assertThat(changed).isFalse();
        assertThat(repository.findByReviewSpaceId("space-1").getFirst().title()).isEqualTo("人工标题");
    }
}
