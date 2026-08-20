package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.ai.ReviewIntentClassifier;
import com.exceptioncoder.toolbox.claudechat.domain.ReviewIntentAssessment;
import com.exceptioncoder.toolbox.claudechat.domain.ReviewSpace;
import com.exceptioncoder.toolbox.claudechat.repository.ReviewIntentRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** 前置路由、持久化和回复后校验的统一业务边界。 */
@Slf4j
@Service
public class ReviewIntentService {
    private static final Pattern EXPLICIT_CHANGE = Pattern.compile(
            "(?:不要|不需要|希望|必须|改成|调整|修改|优化|新增|增加|补充|删除|移除|取消|修复|禁止"
                    + "|(?:需要|要|请)(?:新增|增加|调整|修改|优化|删除|移除|取消|修复|支持|展示|隐藏|改)"
                    + "|可以(?:不|改|增加|删除|取消))");
    private static final Pattern TITLE = Pattern.compile("(?m)^#{1,4}\\s*需求标题[：:]\\s*(.+)$");
    private static final Pattern REQUIREMENT_STRUCTURE = Pattern.compile(
            "(?s)(?:^|\\n)#{1,4}\\s*需求标题[：:].*(?:^|\\n)#{1,4}\\s*需求说明.*(?:^|\\n)#{1,4}\\s*验收场景",
            Pattern.MULTILINE);
    private static final Pattern MARKER = Pattern.compile("<!--\\s*forge-review-intent:(REQUIREMENT|CONSULTATION)\\s*-->");
    private static final long CLASSIFIER_TIMEOUT_SECONDS = 8;

    private final ReviewIntentClassifier classifier;
    private final ReviewIntentRepository repository;
    private final ReviewSpaceService reviewSpaces;

    public ReviewIntentService(ReviewIntentClassifier classifier, ReviewIntentRepository repository,
                               ReviewSpaceService reviewSpaces) {
        this.classifier = classifier;
        this.repository = repository;
        this.reviewSpaces = reviewSpaces;
    }

    public Optional<ReviewIntentAssessment> classifyBeforeReply(String reviewSessionId, String turnId,
                                                                 String clientMessageId, String userText) {
        Optional<ReviewSpace> space = reviewSpaces.findByReviewSessionId(reviewSessionId);
        if (space.isEmpty()) return Optional.empty();
        String normalized = userText == null ? "" : userText.trim();
        Decision decision = explicitRequirement(normalized).orElseGet(() -> classifyWithModel(normalized));
        long now = System.currentTimeMillis();
        ReviewIntentAssessment result = new ReviewIntentAssessment(
                space.get().id(), reviewSessionId, turnId, normalizedMessageId(clientMessageId, turnId),
                decision.intent(), decision.intent(), decision.status(), decision.confidence(), decision.reason(),
                decision.signals(), null, null, now, now);
        repository.insert(result);
        return Optional.of(result);
    }

    public Optional<ReviewIntentAssessment> validateAfterReply(String reviewSessionId, String turnId,
                                                                String assistantText) {
        Optional<ReviewIntentAssessment> stored = repository.findByTurn(reviewSessionId, turnId);
        if (stored.isEmpty()) return Optional.empty();
        ReviewIntentAssessment before = stored.get();
        String response = assistantText == null ? "" : assistantText.trim();
        boolean structured = REQUIREMENT_STRUCTURE.matcher(response).find();
        String marker = markerIntent(response);
        String finalIntent = before.preIntent();
        String status = before.classificationStatus();
        double confidence = before.confidence();
        List<String> signals = new ArrayList<>(before.signals());

        if (structured) {
            signals.add("回复包含需求标题、需求说明和验收场景");
            if ("CONSULTATION".equals(before.preIntent())) status = "CONFLICTED";
            else if ("UNKNOWN".equals(before.preIntent())) status = "INFERRED";
            finalIntent = "REQUIREMENT";
            confidence = Math.max(confidence, 0.85);
        } else if ("UNKNOWN".equals(before.preIntent()) && marker != null) {
            finalIntent = marker;
            status = "INFERRED";
            confidence = Math.max(confidence, 0.65);
            signals.add("兼容标记提供了补充证据");
        } else if (marker != null && !marker.equals(before.preIntent())) {
            status = "CONFLICTED";
            signals.add("旧兼容标记与前置判定冲突");
        }

        String title = structured ? extractTitle(response) : null;
        String content = structured ? MARKER.matcher(response).replaceAll("").trim() : null;
        ReviewIntentAssessment updated = new ReviewIntentAssessment(
                before.reviewSpaceId(), before.reviewSessionId(), before.turnId(), before.clientMessageId(),
                before.preIntent(), finalIntent, status, confidence, before.reason(), signals,
                title, content, before.createdAt(), System.currentTimeMillis());
        repository.insert(updated);
        return Optional.of(updated);
    }

    public List<ReviewIntentAssessment> list(String reviewSpaceId) {
        return repository.findByReviewSpaceId(reviewSpaceId);
    }

    private Optional<Decision> explicitRequirement(String text) {
        Matcher matcher = EXPLICIT_CHANGE.matcher(text);
        if (!matcher.find()) return Optional.empty();
        return Optional.of(new Decision("REQUIREMENT", 0.98, "用户明确要求未来状态发生变化",
                List.of(matcher.group()), "CONFIRMED"));
    }

    private Decision classifyWithModel(String text) {
        if (text.isBlank()) {
            return new Decision("UNKNOWN", 0, "消息没有可判定的文字内容", List.of(), "MISSING");
        }
        try {
            ReviewIntentClassifier.Proposal proposal = CompletableFuture
                    .supplyAsync(() -> classifier.classify(text))
                    .get(CLASSIFIER_TIMEOUT_SECONDS, TimeUnit.SECONDS);
            String intent = normalizeIntent(proposal == null ? null : proposal.intent());
            double confidence = proposal == null ? 0 : Math.max(0, Math.min(1, proposal.confidence()));
            String status = confidence >= 0.75 ? "CONFIRMED" : "INFERRED";
            return new Decision(intent, confidence,
                    proposal == null || proposal.reason() == null ? "模型未给出判定理由" : proposal.reason().trim(),
                    proposal == null ? List.of() : proposal.signals(), status);
        } catch (Exception error) {
            log.warn("[review-intent] 前置分类失败，按 UNKNOWN 继续评审：{}", error.getMessage());
            return new Decision("UNKNOWN", 0, "前置分类服务暂不可用", List.of(), "MISSING");
        }
    }

    private static String normalizeIntent(String value) {
        if (value == null) return "UNKNOWN";
        String normalized = value.trim().toUpperCase(Locale.ROOT);
        return "REQUIREMENT".equals(normalized) || "CONSULTATION".equals(normalized) ? normalized : "UNKNOWN";
    }

    private static String markerIntent(String response) {
        Matcher matcher = MARKER.matcher(response);
        return matcher.find() ? matcher.group(1) : null;
    }

    private static String extractTitle(String response) {
        Matcher matcher = TITLE.matcher(response);
        return matcher.find() ? matcher.group(1).trim() : null;
    }

    private static String normalizedMessageId(String value, String turnId) {
        return value == null || value.isBlank() ? turnId : value.trim();
    }

    private record Decision(String intent, double confidence, String reason, List<String> signals, String status) {
        private Decision {
            signals = signals == null ? List.of() : signals.stream().filter(item -> item != null && !item.isBlank()).toList();
        }
    }
}
