package com.exceptioncoder.toolbox.assistant.service;

import com.exceptioncoder.toolbox.common.assistant.AssistantFeedbackStorePort.FeedbackCategory;
import org.springframework.stereotype.Component;

import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** 从 Assistant 最终回复中提取可直接归档的三类标准反馈草稿。 */
@Component
public class AssistantFeedbackDraftExtractor {

    private static final int MAX_DRAFT_LENGTH = 8_000;
    private static final Pattern HEADING = Pattern.compile(
            "(?im)^\\s*(?:#{1,6}\\s*)?(BUG|需求|优化建议|优化)\\s*(?:反馈)?\\s*草稿"
                    + "(?:\\s*[（(][^\\r\\n]*[）)])?\\s*$");
    private static final Pattern CONFIDENCE = Pattern.compile(
            "(?im)^\\s*(?:#{1,6}\\s*)?置信度\\s*[:：]");

    /** 只接受带明确分类标题且正文非空的草稿，避免从普通讨论中猜测分类。 */
    public Optional<ExtractedDraft> extract(String assistantContent) {
        String content = assistantContent == null ? "" : assistantContent.replace("\r", "");
        Matcher heading = HEADING.matcher(content);
        if (!heading.find()) {
            return Optional.empty();
        }
        int end = content.length();
        Matcher confidence = CONFIDENCE.matcher(content);
        if (confidence.find(heading.end())) {
            end = confidence.start();
        }
        String draft = content.substring(heading.end(), end).trim();
        if (draft.isBlank()) {
            return Optional.empty();
        }
        if (draft.length() > MAX_DRAFT_LENGTH) {
            draft = draft.substring(0, MAX_DRAFT_LENGTH);
        }
        return Optional.of(new ExtractedDraft(category(heading.group(1)), draft));
    }

    private FeedbackCategory category(String label) {
        return switch (label) {
            case "BUG" -> FeedbackCategory.BUG;
            case "需求" -> FeedbackCategory.REQUIREMENT;
            case "优化", "优化建议" -> FeedbackCategory.OPTIMIZATION;
            default -> throw new IllegalArgumentException("不支持的反馈草稿分类: " + label);
        };
    }

    /** Assistant 回复中已经完成分类和规范化的反馈草稿。 */
    public record ExtractedDraft(FeedbackCategory category, String content) {
    }
}
