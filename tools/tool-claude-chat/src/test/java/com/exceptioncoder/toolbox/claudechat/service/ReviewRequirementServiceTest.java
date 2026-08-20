package com.exceptioncoder.toolbox.claudechat.service;

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
        ReviewRequirementService service = new ReviewRequirementService(spaces, repository);
        ReviewSpace space = reviewSpace();
        ReviewRequirement saved = new ReviewRequirement("item-1", "space-1",
                "assistant-content-v1:test", "支持驳回", "业务说明", 1, 10, 10);
        when(spaces.resolve("token")).thenReturn(Optional.of(space));
        when(repository.findByReviewSpaceId("space-1")).thenReturn(List.of(saved));

        List<ReviewRequirement> result = service.synchronize("token", List.of(
                new ReviewRequirementService.DraftCommand(
                        "assistant-content-v1:test", " 支持驳回 ", " 业务说明 ")));

        assertThat(result).containsExactly(saved);
        verify(repository).insertMissing(org.mockito.ArgumentMatchers.eq("space-1"), anyList(), anyLong());
    }

    @Test
    void rejectsInvalidModelDraftBeforePersistence() {
        ReviewSpaceService spaces = mock(ReviewSpaceService.class);
        ReviewRequirementRepository repository = mock(ReviewRequirementRepository.class);
        ReviewRequirementService service = new ReviewRequirementService(spaces, repository);
        when(spaces.resolve("token")).thenReturn(Optional.of(reviewSpace()));

        assertThatThrownBy(() -> service.synchronize("token", List.of(
                new ReviewRequirementService.DraftCommand("invalid", "标题", "说明"))))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(error -> assertThat(((ResponseStatusException) error).getStatusCode())
                        .isEqualTo(HttpStatus.BAD_REQUEST));
        verify(repository, never()).insertMissing(org.mockito.ArgumentMatchers.anyString(), anyList(), anyLong());
    }

    @Test
    void reportsConflictInsteadOfOverwritingNewerRevision() {
        ReviewSpaceService spaces = mock(ReviewSpaceService.class);
        ReviewRequirementRepository repository = mock(ReviewRequirementRepository.class);
        ReviewRequirementService service = new ReviewRequirementService(spaces, repository);
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

    private ReviewSpace reviewSpace() {
        return new ReviewSpace("space-1", "source-1", "review-1", "SAFE_SNAPSHOT",
                "hash", null, "ACTIVE", "评审", null, Long.MAX_VALUE, 1, 1);
    }
}
