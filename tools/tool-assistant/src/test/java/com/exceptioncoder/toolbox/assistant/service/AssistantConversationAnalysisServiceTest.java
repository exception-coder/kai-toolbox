package com.exceptioncoder.toolbox.assistant.service;

import com.exceptioncoder.toolbox.assistant.domain.AssistantConversationAnalysis;
import com.exceptioncoder.toolbox.assistant.domain.AssistantIntent;
import com.exceptioncoder.toolbox.assistant.domain.AssistantIntentResult;
import com.exceptioncoder.toolbox.assistant.domain.AssistantMessageClassification;
import com.exceptioncoder.toolbox.assistant.repository.AssistantConversationAnalysisRepository;
import com.exceptioncoder.toolbox.common.assistant.AssistantCapabilityPort;
import com.exceptioncoder.toolbox.common.assistant.AssistantFeedbackStorePort;
import com.exceptioncoder.toolbox.common.assistant.AssistantFeedbackStorePort.FeedbackCandidate;
import com.exceptioncoder.toolbox.common.assistant.AssistantFeedbackStorePort.FeedbackCategory;
import com.exceptioncoder.toolbox.common.auth.web.AuthContext;
import com.exceptioncoder.toolbox.common.auth.web.AuthPrincipal;
import com.exceptioncoder.toolbox.common.requirement.RequirementType;
import com.exceptioncoder.toolbox.common.session.SessionOwnershipPort;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** 会话反馈增量水位契约测试。 */
class AssistantConversationAnalysisServiceTest {

    private final AssistantConversationAnalysisRepository repository =
            mock(AssistantConversationAnalysisRepository.class);
    private final AssistantIntentRouter router = mock(AssistantIntentRouter.class);
    private final SessionOwnershipPort ownership = mock(SessionOwnershipPort.class);
    private final AssistantFeedbackCandidateFactory candidateFactory = mock(AssistantFeedbackCandidateFactory.class);
    private final AssistantFeedbackDescriptionGenerator descriptionGenerator =
            mock(AssistantFeedbackDescriptionGenerator.class);
    private final AssistantFeedbackStorePort feedbackStore = mock(AssistantFeedbackStorePort.class);
    private final AssistantConversationAnalysisService service =
            new AssistantConversationAnalysisService(
                    repository, router, ownership, candidateFactory, descriptionGenerator, feedbackStore);

    @BeforeEach
    void authenticate() {
        AuthContext.set(new AuthPrincipal(7L, "user", List.of("USER"), List.of(), "jti", 1L));
        when(ownership.canCurrentUserAccess("session-1")).thenReturn(true);
    }

    @AfterEach
    void clearAuthentication() {
        AuthContext.clear();
    }

    @Test
    void advancesWatermarkOnlyAcrossTheProvidedIncrement() {
        when(repository.find(7L, "session-1")).thenReturn(java.util.Optional.of(
                new AssistantConversationAnalysis("state-1", 7L, "session-1", 20L,
                        "- [BUG] #20 旧反馈", 1L, 2L)));
        AssistantMessageClassification classification = new AssistantMessageClassification(
                new AssistantIntentResult(AssistantIntent.SUGGESTION, 0.91D, "新增能力"),
                FeedbackCategory.REQUIREMENT, RequirementType.NEW_MODULE);
        FeedbackCandidate candidate = new FeedbackCandidate(
                "candidate-1", 30L, FeedbackCategory.REQUIREMENT, RequirementType.NEW_MODULE,
                "希望增加导出功能", 0.91D, "新增能力", 3L);
        when(router.classifyFeedbackWithContext("希望增加导出功能", "- [BUG] #20 旧反馈"))
                .thenReturn(classification);
        when(descriptionGenerator.generate(any(), any(), any(), any())).thenReturn("## 需求标题\n增加导出功能");
        when(candidateFactory.candidate(anyLong(), any(), any(), any(), anyLong(), any())).thenReturn(candidate);
        when(candidateFactory.context(7L, "session-1")).thenReturn(
                new AssistantFeedbackStorePort.FeedbackContext(7L, "session-1", "ERP", "", ""));

        AssistantCapabilityPort.ConversationAnalysisResult result = service.analyze(command(
                20L, 30L, new AssistantCapabilityPort.ConversationMessage(10L, "user", "旧消息"),
                new AssistantCapabilityPort.ConversationMessage(25L, "assistant", "回复"),
                new AssistantCapabilityPort.ConversationMessage(30L, "user", "希望增加导出功能")));

        assertThat(result.fromWatermark()).isEqualTo(20L);
        assertThat(result.toWatermark()).isEqualTo(30L);
        assertThat(result.detections()).extracting(AssistantCapabilityPort.ConversationDetection::intent)
                .containsExactly("SUGGESTION");
        verify(router).classifyFeedbackWithContext("希望增加导出功能", "- [BUG] #20 旧反馈");
        verify(feedbackStore).saveCandidates(any(AssistantFeedbackStorePort.SaveCommand.class));
        verify(repository).upsert(any(AssistantConversationAnalysis.class));
    }

    @Test
    void repeatedTerminalWithoutIncrementDoesNotCallClassifier() {
        when(repository.find(7L, "session-1")).thenReturn(java.util.Optional.of(
                new AssistantConversationAnalysis("state-1", 7L, "session-1", 30L,
                        "summary", 1L, 2L)));

        AssistantCapabilityPort.ConversationAnalysisResult result = service.analyze(command(30L, 30L));

        assertThat(result.advanced()).isFalse();
        assertThat(result.toWatermark()).isEqualTo(30L);
        verify(router, never()).classifyFeedbackWithContext(any(), any());
        verify(repository, never()).upsert(any());
    }

    @Test
    void staleWatermarkCannotOverwriteNewerState() {
        when(repository.find(7L, "session-1")).thenReturn(java.util.Optional.of(
                new AssistantConversationAnalysis("state-1", 7L, "session-1", 40L,
                        "new summary", 1L, 2L)));

        AssistantCapabilityPort.ConversationAnalysisResult result = service.analyze(command(
                20L, 50L, new AssistantCapabilityPort.ConversationMessage(50L, "user", "反馈")));

        assertThat(result.stale()).isTrue();
        assertThat(result.toWatermark()).isEqualTo(40L);
        verify(router, never()).classifyFeedbackWithContext(any(), any());
        verify(repository, never()).upsert(any());
    }

    @Test
    void classifierFailureDoesNotAdvanceTheWatermark() {
        when(repository.find(7L, "session-1")).thenReturn(java.util.Optional.of(
                new AssistantConversationAnalysis("state-1", 7L, "session-1", 20L,
                        "summary", 1L, 2L)));
        when(router.classifyFeedbackWithContext("导出失败", "summary"))
                .thenThrow(new IllegalStateException("意图识别超时"));

        assertThatThrownBy(() -> service.analyze(command(
                20L, 30L, new AssistantCapabilityPort.ConversationMessage(30L, "user", "导出失败"))))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("意图识别超时");

        verify(repository, never()).upsert(any());
    }

    @Test
    void mysqlFailureDoesNotAdvanceTheWatermark() {
        when(repository.find(7L, "session-1")).thenReturn(java.util.Optional.of(
                new AssistantConversationAnalysis("state-1", 7L, "session-1", 20L,
                        "summary", 1L, 2L)));
        AssistantMessageClassification classification = new AssistantMessageClassification(
                new AssistantIntentResult(AssistantIntent.BUG, 0.95D, "已有功能失败"),
                FeedbackCategory.BUG, RequirementType.BUG_FIX);
        FeedbackCandidate candidate = new FeedbackCandidate(
                "candidate-1", 30L, FeedbackCategory.BUG, RequirementType.BUG_FIX,
                "导出失败", 0.95D, "已有功能失败", 3L);
        when(router.classifyFeedbackWithContext("导出失败", "summary")).thenReturn(classification);
        when(descriptionGenerator.generate(any(), any(), any(), any())).thenReturn("## 问题概述\n导出失败");
        when(candidateFactory.candidate(anyLong(), any(), any(), any(), anyLong(), any())).thenReturn(candidate);
        when(candidateFactory.context(7L, "session-1")).thenReturn(
                new AssistantFeedbackStorePort.FeedbackContext(7L, "session-1", "ERP", "", ""));
        doThrow(new IllegalStateException("MySQL 不可用"))
                .when(feedbackStore).saveCandidates(any(AssistantFeedbackStorePort.SaveCommand.class));

        assertThatThrownBy(() -> service.analyze(command(
                20L, 30L, new AssistantCapabilityPort.ConversationMessage(30L, "user", "导出失败"))))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("MySQL 不可用");

        verify(repository, never()).upsert(any());
    }

    private AssistantConversationAnalysisService.AnalyzeConversationCommand command(
            long from, long to, AssistantCapabilityPort.ConversationMessage... messages) {
        return new AssistantConversationAnalysisService.AnalyzeConversationCommand(
                "session-1", from, to, true, List.of(messages));
    }
}
