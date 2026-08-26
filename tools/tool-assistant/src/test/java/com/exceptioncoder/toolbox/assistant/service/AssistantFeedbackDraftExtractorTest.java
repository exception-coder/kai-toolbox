package com.exceptioncoder.toolbox.assistant.service;

import com.exceptioncoder.toolbox.common.assistant.AssistantFeedbackStorePort.FeedbackCategory;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class AssistantFeedbackDraftExtractorTest {

    private final AssistantFeedbackDraftExtractor extractor = new AssistantFeedbackDraftExtractor();

    @Test
    void extractsLegacyBugDraftAndDropsTheConfidenceParagraph() {
        AssistantFeedbackDraftExtractor.ExtractedDraft draft = extractor.extract("""
                已确认是滚动容器裁剪。

                BUG 草稿（可编辑，未登记）

                - 标题：新品进度悬浮提示被裁剪
                - 期望结果：提示完整可见

                置信度：高。
                """).orElseThrow();

        assertThat(draft.category()).isEqualTo(FeedbackCategory.BUG);
        assertThat(draft.content())
                .contains("标题：新品进度悬浮提示被裁剪")
                .doesNotContain("已确认是", "置信度", "未登记");
    }

    @Test
    void extractsTheThreeCanonicalHeadings() {
        assertThat(extractor.extract("## BUG 反馈草稿\n\n- 标题：错误").orElseThrow().category())
                .isEqualTo(FeedbackCategory.BUG);
        assertThat(extractor.extract("## 需求反馈草稿\n\n- 标题：新增导出").orElseThrow().category())
                .isEqualTo(FeedbackCategory.REQUIREMENT);
        assertThat(extractor.extract("## 优化建议草稿\n\n- 标题：简化流程").orElseThrow().category())
                .isEqualTo(FeedbackCategory.OPTIMIZATION);
    }

    @Test
    void ignoresOrdinaryAssistantDiscussion() {
        assertThat(extractor.extract("建议把提示框改为 Portal。"))
                .isEmpty();
    }
}
