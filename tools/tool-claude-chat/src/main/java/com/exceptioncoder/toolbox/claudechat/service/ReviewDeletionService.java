package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.domain.ReviewSpace;
import com.exceptioncoder.toolbox.claudechat.repository.ReviewSpaceRepository;
import com.exceptioncoder.toolbox.claudechat.repository.ReviewRequirementRepository;
import com.exceptioncoder.toolbox.claudechat.repository.ReviewIntentRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 永久删除单条计划评审及其独立分析会话。 */
@Service
public class ReviewDeletionService {
    private final ReviewSpaceRepository reviewRepository;
    private final SessionDeletionService sessionDeletionService;
    private final ReviewRequirementRepository requirementRepository;
    private final ReviewIntentRepository intentRepository;

    public ReviewDeletionService(ReviewSpaceRepository reviewRepository,
                                 SessionDeletionService sessionDeletionService,
                                 ReviewRequirementRepository requirementRepository,
                                 ReviewIntentRepository intentRepository) {
        this.reviewRepository = reviewRepository;
        this.sessionDeletionService = sessionDeletionService;
        this.requirementRepository = requirementRepository;
        this.intentRepository = intentRepository;
    }

    @Transactional
    public void delete(String reviewSpaceId) {
        ReviewSpace review = reviewRepository.findById(reviewSpaceId).orElse(null);
        if (review == null) {
            return;
        }
        requirementRepository.deleteByReviewSpaceId(reviewSpaceId);
        intentRepository.deleteByReviewSpaceId(reviewSpaceId);
        reviewRepository.deleteAggregate(reviewSpaceId);
        sessionDeletionService.delete(review.reviewSessionId());
    }
}
