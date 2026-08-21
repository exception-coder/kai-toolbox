package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.ai.ReviewIntentClassifier;
import com.exceptioncoder.toolbox.claudechat.ai.ReviewRequirementExtractor;
import com.exceptioncoder.toolbox.claudechat.domain.ReviewIntentAssessment;
import com.exceptioncoder.toolbox.claudechat.domain.ReviewSpace;
import com.exceptioncoder.toolbox.claudechat.repository.ReviewIntentRepository;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class ReviewIntentServiceTest {

    @Test
    void routesExplicitChangeBeforeAgentReplyWithoutDependingOnMarker() {
        Fixture fixture = fixture();

        ReviewIntentAssessment result = fixture.service.classifyBeforeReply(
                "review-session", "turn-1", "message-1", "计划评审不要显示工具调用信息").orElseThrow();

        assertThat(result.preIntent()).isEqualTo("REQUIREMENT");
        assertThat(result.classificationStatus()).isEqualTo("CONFIRMED");
        assertThat(result.confidence()).isEqualTo(0.98);
        verifyNoInteractions(fixture.classifier);
        verify(fixture.repository).insert(result);
    }

    @Test
    void pureQuestionUsesStructuredModelDecisionInsteadOfKeywordGuessing() {
        Fixture fixture = fixture();
        when(fixture.classifier.classify("请问为什么显示工具调用？"))
                .thenReturn(new ReviewIntentClassifier.Proposal(
                        "CONSULTATION", 0.93, "用户只询问当前现象原因", List.of("为什么")));

        ReviewIntentAssessment result = fixture.service.classifyBeforeReply(
                "review-session", "turn-2", "message-2", "请问为什么显示工具调用？").orElseThrow();

        assertThat(result.finalIntent()).isEqualTo("CONSULTATION");
        assertThat(result.classificationStatus()).isEqualTo("CONFIRMED");
    }

    @Test
    void semanticUnknownIsConfirmedWithoutMasqueradingAsProtocolFailure() {
        Fixture fixture = fixture();
        when(fixture.classifier.classify("这个再看看"))
                .thenReturn(new ReviewIntentClassifier.Proposal(
                        "UNKNOWN", 0.88, "缺少明确对象和目标状态", List.of("指代不明")));

        ReviewIntentAssessment result = fixture.service.classifyBeforeReply(
                "review-session", "turn-unknown", "message-unknown", "这个再看看").orElseThrow();

        assertThat(result.finalIntent()).isEqualTo("UNKNOWN");
        assertThat(result.classificationStatus()).isEqualTo("CONFIRMED");
    }

    @Test
    void completeRequirementStructureUpgradesUnknownAndExtractsBusinessDraft() {
        Fixture fixture = fixture();
        ReviewIntentAssessment before = new ReviewIntentAssessment(
                "space-1", "review-session", "turn-3", "message-3",
                "UNKNOWN", "UNKNOWN", "MISSING", 0, "前置分类服务暂不可用", List.of(),
                null, null, 10, 10);
        when(fixture.repository.findByTurn("review-session", "turn-3")).thenReturn(Optional.of(before));
        String response = """
                ### 需求标题：隐藏工具调用
                ### 需求说明
                评审页面只展示业务对话。
                ### 待确认项
                无。
                ### 验收场景
                评审员看不到技术执行轨迹。
                """;

        ReviewIntentAssessment result = fixture.service.validateAfterReply(
                "review-session", "turn-3", "计划评审不要显示工具调用", response).orElseThrow();

        assertThat(result.finalIntent()).isEqualTo("REQUIREMENT");
        assertThat(result.classificationStatus()).isEqualTo("INFERRED");
        assertThat(result.extractedTitle()).isEqualTo("隐藏评审技术轨迹");
        assertThat(result.extractedContent()).contains("业务评审人员只看到业务对话");
        ArgumentCaptor<ReviewIntentAssessment> saved = ArgumentCaptor.forClass(ReviewIntentAssessment.class);
        verify(fixture.repository).insert(saved.capture());
        assertThat(saved.getValue().signals()).contains("回复包含需求标题、需求说明和验收场景");
    }

    @Test
    void unstructuredAgentReplyIsRewrittenInsteadOfCopiedIntoRequirementList() {
        Fixture fixture = fixture();
        ReviewIntentAssessment before = new ReviewIntentAssessment(
                "space-1", "review-session", "turn-plain", "message-plain",
                "REQUIREMENT", "REQUIREMENT", "CONFIRMED", 0.98, "明确变更", List.of(),
                null, null, 10, 10);
        when(fixture.repository.findByTurn("review-session", "turn-plain")).thenReturn(Optional.of(before));
        String rawReply = "确认，可以隐藏。附件读取失败，但可以直接交给开发处理。";

        ReviewIntentAssessment result = fixture.service.validateAfterReply(
                "review-session", "turn-plain", "计划评审不要显示工具调用", rawReply).orElseThrow();

        assertThat(result.extractedTitle()).isEqualTo("隐藏评审技术轨迹");
        assertThat(result.extractedContent())
                .contains("## 需求说明", "## 待确认项", "## 验收场景")
                .doesNotContain(rawReply, "附件读取失败", "交给开发处理");
        verify(fixture.extractor).extract(org.mockito.ArgumentMatchers.argThat(context ->
                context.contains("计划评审不要显示工具调用") && context.contains(rawReply)));
    }

    private Fixture fixture() {
        ReviewIntentClassifier classifier = mock(ReviewIntentClassifier.class);
        ReviewRequirementExtractor extractor = mock(ReviewRequirementExtractor.class);
        when(extractor.extract(org.mockito.ArgumentMatchers.anyString()))
                .thenReturn(new ReviewRequirementExtractor.Proposal(
                        "隐藏评审技术轨迹", "业务评审人员只看到业务对话。", List.of(),
                        List.of("公开评审页面不展示技术执行轨迹。")));
        ReviewIntentRepository repository = mock(ReviewIntentRepository.class);
        ReviewSpaceService spaces = mock(ReviewSpaceService.class);
        when(spaces.findByReviewSessionId("review-session")).thenReturn(Optional.of(new ReviewSpace(
                "space-1", "source-session", "review-session", "SAFE_SNAPSHOT", "hash", null,
                "ACTIVE", "评审", null, Long.MAX_VALUE, 1, 1)));
        return new Fixture(classifier, extractor, repository,
                new ReviewIntentService(classifier, extractor, repository, spaces));
    }

    private record Fixture(ReviewIntentClassifier classifier, ReviewRequirementExtractor extractor,
                           ReviewIntentRepository repository,
                           ReviewIntentService service) {}
}
