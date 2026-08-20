package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.domain.ReviewSpace;
import com.exceptioncoder.toolbox.claudechat.repository.ReviewSpaceRepository;
import com.exceptioncoder.toolbox.claudechat.repository.ReviewRequirementRepository;
import com.exceptioncoder.toolbox.claudechat.repository.ReviewIntentRepository;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;

import java.util.Optional;

import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class ReviewDeletionServiceTest {

    @Test
    void deletesReviewAggregateBeforeItsAnalysisSession() {
        ReviewSpaceRepository reviews = mock(ReviewSpaceRepository.class);
        SessionDeletionService sessions = mock(SessionDeletionService.class);
        ReviewRequirementRepository requirements = mock(ReviewRequirementRepository.class);
        ReviewIntentRepository intents = mock(ReviewIntentRepository.class);
        ReviewDeletionService service = new ReviewDeletionService(reviews, sessions, requirements, intents);
        ReviewSpace review = new ReviewSpace("space-1", "source-1", "review-session-1",
                "SAFE_SNAPSHOT", "hash", null, "ACTIVE", "评审", null, 10L, 1L, 1L);
        when(reviews.findById("space-1")).thenReturn(Optional.of(review));

        service.delete("space-1");

        InOrder ordered = inOrder(requirements, intents, reviews, sessions);
        ordered.verify(requirements).deleteByReviewSpaceId("space-1");
        ordered.verify(intents).deleteByReviewSpaceId("space-1");
        ordered.verify(reviews).deleteAggregate("space-1");
        ordered.verify(sessions).delete("review-session-1");
    }

    @Test
    void repeatedDeleteIsIdempotentWhenReviewNoLongerExists() {
        ReviewSpaceRepository reviews = mock(ReviewSpaceRepository.class);
        SessionDeletionService sessions = mock(SessionDeletionService.class);
        ReviewRequirementRepository requirements = mock(ReviewRequirementRepository.class);
        ReviewIntentRepository intents = mock(ReviewIntentRepository.class);
        ReviewDeletionService service = new ReviewDeletionService(reviews, sessions, requirements, intents);
        when(reviews.findById("missing")).thenReturn(Optional.empty());

        service.delete("missing");

        verifyNoInteractions(sessions);
        verifyNoInteractions(requirements);
        verifyNoInteractions(intents);
    }
}
