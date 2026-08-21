package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.ai.ReviewRequirementExtractor;
import com.exceptioncoder.toolbox.claudechat.domain.ReviewRequirement;
import com.exceptioncoder.toolbox.claudechat.domain.ReviewSpace;
import com.exceptioncoder.toolbox.claudechat.repository.ReviewRequirementRepository;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ReviewRequirementServiceTest {

    @Test
    void synchronizesOnlyValidatedDraftsIntoResolvedReview() {
        ReviewSpaceService spaces = mock(ReviewSpaceService.class);
        ReviewRequirementRepository repository = mock(ReviewRequirementRepository.class);
        ReviewRequirementExtractor extractor = mock(ReviewRequirementExtractor.class);
        ReviewRequirementService service = new ReviewRequirementService(spaces, repository, extractor);
        ReviewSpace space = reviewSpace();
        ReviewRequirement saved = new ReviewRequirement("item-1", "space-1",
                "assistant-content-v1:test", "支持驳回", "业务说明", 1, 10, 10);
        when(spaces.resolve("token")).thenReturn(Optional.of(space));
        when(repository.findByReviewSpaceId("space-1")).thenReturn(List.of(), List.of(saved));
        when(repository.insertRequirement(org.mockito.ArgumentMatchers.eq("space-1"),
                org.mockito.ArgumentMatchers.any(ReviewRequirementRepository.Draft.class), anyLong()))
                .thenReturn("item-1");

        List<ReviewRequirement> result = service.synchronize("token", List.of(
                new ReviewRequirementService.DraftCommand(
                        "assistant-content-v1:test", " 支持驳回 ", " 业务说明 ")));

        assertThat(result).containsExactly(saved);
        verify(repository).insertRequirement(org.mockito.ArgumentMatchers.eq("space-1"),
                org.mockito.ArgumentMatchers.any(ReviewRequirementRepository.Draft.class), anyLong());
        verify(repository).insertSource(org.mockito.ArgumentMatchers.eq("space-1"),
                org.mockito.ArgumentMatchers.eq("item-1"),
                org.mockito.ArgumentMatchers.any(ReviewRequirementRepository.Source.class), anyLong());
    }

    @Test
    void rejectsInvalidModelDraftBeforePersistence() {
        ReviewSpaceService spaces = mock(ReviewSpaceService.class);
        ReviewRequirementRepository repository = mock(ReviewRequirementRepository.class);
        ReviewRequirementExtractor extractor = mock(ReviewRequirementExtractor.class);
        ReviewRequirementService service = new ReviewRequirementService(spaces, repository, extractor);
        when(spaces.resolve("token")).thenReturn(Optional.of(reviewSpace()));

        assertThatThrownBy(() -> service.synchronize("token", List.of(
                new ReviewRequirementService.DraftCommand("invalid", "标题", "说明"))))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(error -> assertThat(((ResponseStatusException) error).getStatusCode())
                        .isEqualTo(HttpStatus.BAD_REQUEST));
        verify(repository, never()).insertRequirement(org.mockito.ArgumentMatchers.anyString(),
                org.mockito.ArgumentMatchers.any(ReviewRequirementRepository.Draft.class), anyLong());
    }

    @Test
    void reportsConflictInsteadOfOverwritingNewerRevision() {
        ReviewSpaceService spaces = mock(ReviewSpaceService.class);
        ReviewRequirementRepository repository = mock(ReviewRequirementRepository.class);
        ReviewRequirementExtractor extractor = mock(ReviewRequirementExtractor.class);
        ReviewRequirementService service = new ReviewRequirementService(spaces, repository, extractor);
        when(spaces.resolve("token")).thenReturn(Optional.of(reviewSpace()));
        when(repository.update(org.mockito.ArgumentMatchers.eq("space-1"),
                org.mockito.ArgumentMatchers.eq("item-1"),
                org.mockito.ArgumentMatchers.any(ReviewRequirementRepository.Update.class), anyLong()))
                .thenReturn(false);

        assertThatThrownBy(() -> service.update("token", "item-1",
                new ReviewRequirementService.UpdateCommand("标题", "说明", 1)))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(error -> assertThat(((ResponseStatusException) error).getStatusCode())
                        .isEqualTo(HttpStatus.CONFLICT));
    }

    @Test
    void mergesLegacyDuplicateIntoExistingRequirementAndKeepsSourceEvidence() {
        ReviewSpaceService spaces = mock(ReviewSpaceService.class);
        ReviewRequirementRepository repository = mock(ReviewRequirementRepository.class);
        ReviewRequirementExtractor extractor = mock(ReviewRequirementExtractor.class);
        ReviewRequirementService service = new ReviewRequirementService(spaces, repository, extractor);
        ReviewRequirement target = new ReviewRequirement("target", "space-1",
                "assistant-content-v1:original", "压缩移动端头部", "原说明", 1, 1, 1);
        ReviewRequirement legacy = new ReviewRequirement("legacy", "space-1",
                "assistant-content-v1:correction", "我说的是红框区域", "用户原话", 1, 2, 2);
        when(spaces.resolve("token")).thenReturn(Optional.of(reviewSpace()));
        when(repository.findActiveBySourceMessageId("space-1", "assistant-content-v1:correction"))
                .thenReturn(legacy);
        when(repository.findByReviewSpaceId("space-1"))
                .thenReturn(List.of(target, legacy), List.of(target));
        when(extractor.compile(org.mockito.ArgumentMatchers.anyString())).thenReturn(
                new ReviewRequirementExtractor.Compilation(
                        ReviewRequirementExtractor.Operation.MERGE, "target",
                        "压缩移动端头部区域", "合并后的完整业务说明", "属于同一空间优化"));

        List<ReviewRequirement> result = service.synchronize("token", List.of(
                new ReviewRequirementService.DraftCommand("assistant-content-v1:correction",
                        "我说的是红框区域", "用户原话", "我说的是优化红框区域", "AI 分析")));

        assertThat(result).containsExactly(target);
        verify(repository).updateCompiled(org.mockito.ArgumentMatchers.eq("space-1"),
                org.mockito.ArgumentMatchers.eq("target"),
                org.mockito.ArgumentMatchers.eq("压缩移动端头部区域"),
                org.mockito.ArgumentMatchers.eq("合并后的完整业务说明"),
                org.mockito.ArgumentMatchers.anyLong());
        verify(repository).remove(org.mockito.ArgumentMatchers.eq("space-1"),
                org.mockito.ArgumentMatchers.eq("legacy"), anyLong());
        verify(repository).insertSource(org.mockito.ArgumentMatchers.eq("space-1"),
                org.mockito.ArgumentMatchers.eq("target"),
                org.mockito.ArgumentMatchers.argThat(source ->
                        source.sourceText().equals("我说的是优化红框区域")
                                && source.operation().equals("MERGE")), anyLong());
    }

    @Test
    void ignoresClarificationWithoutCreatingFormalRequirement() {
        ReviewSpaceService spaces = mock(ReviewSpaceService.class);
        ReviewRequirementRepository repository = mock(ReviewRequirementRepository.class);
        ReviewRequirementExtractor extractor = mock(ReviewRequirementExtractor.class);
        ReviewRequirementService service = new ReviewRequirementService(spaces, repository, extractor);
        ReviewRequirement existing = new ReviewRequirement("target", "space-1",
                "assistant-content-v1:original", "现有需求", "说明", 1, 1, 1);
        when(spaces.resolve("token")).thenReturn(Optional.of(reviewSpace()));
        when(repository.findByReviewSpaceId("space-1"))
                .thenReturn(List.of(existing), List.of(existing));
        when(extractor.compile(org.mockito.ArgumentMatchers.anyString())).thenReturn(
                new ReviewRequirementExtractor.Compilation(
                        ReviewRequirementExtractor.Operation.IGNORE, null, null, null, "普通确认"));

        service.synchronize("token", List.of(new ReviewRequirementService.DraftCommand(
                "assistant-content-v1:thanks", "好的", "普通确认", "好的", "已确认")));

        verify(repository, never()).insertRequirement(org.mockito.ArgumentMatchers.anyString(),
                org.mockito.ArgumentMatchers.any(ReviewRequirementRepository.Draft.class), anyLong());
        verify(repository).insertSource(org.mockito.ArgumentMatchers.eq("space-1"),
                org.mockito.ArgumentMatchers.isNull(),
                org.mockito.ArgumentMatchers.argThat(source -> source.operation().equals("IGNORE")), anyLong());
    }

    private ReviewSpace reviewSpace() {
        return new ReviewSpace("space-1", "source-1", "review-1", "SAFE_SNAPSHOT",
                "hash", null, "ACTIVE", "评审", null, Long.MAX_VALUE, 1, 1);
    }
}
