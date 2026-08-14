package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.claudechat.domain.ReviewSpace;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/** 公开评审投影必须携带创建边界，前端据此排除完整分叉中的旧开发回复。 */
class ReviewSpaceControllerTest {

    @Test
    void publicViewIncludesReviewCreationBoundary() {
        ReviewSpace space = new ReviewSpace("space-1", "source-1", "review-1", "FULL_FORK",
                "hash", "ACTIVE", "计划评审", "snapshot", 9_000L, 1_234L, 1_234L);

        ReviewSpaceController.PublicReviewView view =
                ReviewSpaceController.PublicReviewView.from(space, "来源开发会话");

        assertThat(view.reviewSessionId()).isEqualTo("review-1");
        assertThat(view.createdAt()).isEqualTo(1_234L);
        assertThat(view.expiresAt()).isEqualTo(9_000L);
    }
}
