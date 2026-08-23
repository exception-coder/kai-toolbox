package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.ai.ReviewRequirementCompiler;
import com.exceptioncoder.toolbox.claudechat.domain.ReviewRequirement;
import com.exceptioncoder.toolbox.claudechat.domain.ReviewSpace;
import com.exceptioncoder.toolbox.claudechat.repository.ReviewRequirementRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Objects;

/** 维护公开计划评审中可由评审员确认修订的当前需求清单。 */
@Service
public class ReviewRequirementService {
    private static final Logger log = LoggerFactory.getLogger(ReviewRequirementService.class);
    private static final int MAX_SYNC_ITEMS = 100;
    private static final int MAX_TITLE_LENGTH = 120;
    private static final int MAX_CONTENT_LENGTH = 10_000;
    private static final int MAX_SOURCE_LENGTH = 10_000;
    private static final int MAX_COMPILER_REQUIREMENTS = 30;
    private static final int MAX_COMPILER_ITEM_LENGTH = 2_500;
    private static final String SOURCE_ID_PREFIX = "assistant-content-v1:";

    private final ReviewSpaceService reviewSpaceService;
    private final ReviewRequirementRepository repository;
    private final ReviewRequirementCompiler compiler;

    public ReviewRequirementService(ReviewSpaceService reviewSpaceService,
                                    ReviewRequirementRepository repository,
                                    ReviewRequirementCompiler compiler) {
        this.reviewSpaceService = reviewSpaceService;
        this.repository = repository;
        this.compiler = compiler;
    }

    public List<ReviewRequirement> list(String token) {
        return repository.findByReviewSpaceId(resolve(token).id());
    }

    @Transactional
    public List<ReviewRequirement> synchronize(String token, List<DraftCommand> commands) {
        ReviewSpace space = resolve(token);
        if (commands == null || commands.size() > MAX_SYNC_ITEMS) {
            throw badRequest("单次同步需求数量不合法");
        }
        List<ReviewRequirementRepository.Draft> drafts = commands.stream().map(this::validatedDraft).toList();
        for (int index = 0; index < drafts.size(); index++) {
            compileCandidate(space.id(), drafts.get(index), commands.get(index));
        }
        return repository.findByReviewSpaceId(space.id());
    }

    @Transactional
    public ReviewRequirement update(String token, String id, UpdateCommand command) {
        ReviewSpace space = resolve(token);
        if (command == null || command.expectedRevision() < 1) {
            throw badRequest("需求修订版本不合法");
        }
        String title = requiredText(command.title(), MAX_TITLE_LENGTH, "需求标题");
        String content = requiredText(command.content(), MAX_CONTENT_LENGTH, "需求说明");
        ReviewRequirementRepository.Update update = new ReviewRequirementRepository.Update(
                title, content, command.expectedRevision());
        if (!repository.update(space.id(), id, update, System.currentTimeMillis())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "需求已在其他页面更新，请刷新后重试");
        }
        return repository.findByReviewSpaceId(space.id()).stream()
                .filter(requirement -> requirement.id().equals(id))
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "需求条目不存在"));
    }

    @Transactional
    public void delete(String token, String id) {
        repository.remove(resolve(token).id(), id, System.currentTimeMillis());
    }

    private ReviewSpace resolve(String token) {
        return reviewSpaceService.resolve(token)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "评审链接已失效"));
    }

    private ReviewRequirementRepository.Draft validatedDraft(DraftCommand command) {
        if (command == null || command.sourceMessageId() == null
                || !command.sourceMessageId().startsWith(SOURCE_ID_PREFIX)
                || command.sourceMessageId().length() > 200) {
            throw badRequest("需求来源消息标识不合法");
        }
        boundedText(command.sourceText(), MAX_SOURCE_LENGTH, "需求来源");
        boundedText(command.analysisText(), MAX_SOURCE_LENGTH, "AI 分析");
        return new ReviewRequirementRepository.Draft(command.sourceMessageId(),
                requiredText(command.title(), MAX_TITLE_LENGTH, "需求标题"),
                requiredText(command.content(), MAX_CONTENT_LENGTH, "需求说明"));
    }

    private void compileCandidate(String reviewSpaceId, ReviewRequirementRepository.Draft draft,
                                  DraftCommand command) {
        if (repository.hasProcessedSource(reviewSpaceId, draft.sourceMessageId())) {
            return;
        }
        long now = System.currentTimeMillis();
        ReviewRequirement legacy = repository.findActiveBySourceMessageId(
                reviewSpaceId, draft.sourceMessageId());
        List<ReviewRequirement> current = repository.findByReviewSpaceId(reviewSpaceId).stream()
                .filter(item -> legacy == null || !item.id().equals(legacy.id()))
                .toList();
        Decision decision = proposeDecision(draft, command, current);
        String requirementId = applyDecision(reviewSpaceId, draft, legacy, decision, now);
        repository.insertSource(reviewSpaceId, requirementId,
                new ReviewRequirementRepository.Source(draft.sourceMessageId(),
                        optionalText(command.sourceText(), MAX_SOURCE_LENGTH),
                        optionalText(command.analysisText(), MAX_SOURCE_LENGTH),
                        decision.operation().name()), now);
    }

    private Decision proposeDecision(ReviewRequirementRepository.Draft draft, DraftCommand command,
                                     List<ReviewRequirement> current) {
        try {
            ReviewRequirementCompiler.Compilation proposed = compiler.compile(
                    compilerContext(draft, command, current));
            return validatedDecision(proposed, draft, current);
        } catch (RuntimeException error) {
            log.warn("需求候选编译失败，降级为独立需求，sourceMessageId={}", draft.sourceMessageId(), error);
            return Decision.create(draft);
        }
    }

    private Decision validatedDecision(ReviewRequirementCompiler.Compilation proposed,
                                       ReviewRequirementRepository.Draft fallback,
                                       List<ReviewRequirement> current) {
        if (proposed == null || proposed.operation() == null) {
            return Decision.create(fallback);
        }
        ReviewRequirement target = current.stream()
                .filter(item -> Objects.equals(item.id(), proposed.targetRequirementId()))
                .findFirst().orElse(null);
        return switch (proposed.operation()) {
            case CREATE -> new Decision(proposed.operation(), null,
                    validOrFallback(proposed.title(), fallback.title(), MAX_TITLE_LENGTH),
                    validOrFallback(proposed.content(), fallback.content(), MAX_CONTENT_LENGTH));
            case MERGE, UPDATE -> target == null
                    || !validText(proposed.title(), MAX_TITLE_LENGTH)
                    || !validText(proposed.content(), MAX_CONTENT_LENGTH)
                    ? Decision.create(fallback)
                    : new Decision(proposed.operation(), target,
                    proposed.title().trim(), proposed.content().trim());
            case REMOVE -> target == null ? Decision.create(fallback)
                    : new Decision(proposed.operation(), target, target.title(), target.content());
            case IGNORE -> new Decision(proposed.operation(), null, fallback.title(), fallback.content());
        };
    }

    private String applyDecision(String reviewSpaceId, ReviewRequirementRepository.Draft draft,
                                 ReviewRequirement legacy, Decision decision, long now) {
        return switch (decision.operation()) {
            case CREATE -> retainOrCreate(reviewSpaceId, draft, legacy, decision, now);
            case MERGE, UPDATE -> mergeIntoTarget(reviewSpaceId, legacy, decision, now);
            case REMOVE -> removeTarget(reviewSpaceId, legacy, decision.target(), now);
            case IGNORE -> removeLegacy(reviewSpaceId, legacy, now);
        };
    }

    private String retainOrCreate(String reviewSpaceId, ReviewRequirementRepository.Draft draft,
                                  ReviewRequirement legacy, Decision decision, long now) {
        if (legacy != null) {
            repository.updateCompiled(reviewSpaceId, legacy.id(), decision.title(), decision.content(), now);
            return legacy.id();
        }
        return repository.insertRequirement(reviewSpaceId,
                new ReviewRequirementRepository.Draft(
                        draft.sourceMessageId(), decision.title(), decision.content()), now);
    }

    private String mergeIntoTarget(String reviewSpaceId, ReviewRequirement legacy,
                                   Decision decision, long now) {
        ReviewRequirement target = decision.target();
        repository.updateCompiled(reviewSpaceId, target.id(), decision.title(), decision.content(), now);
        if (legacy != null && !legacy.id().equals(target.id())) {
            repository.moveSources(reviewSpaceId, legacy.id(), target.id(), now);
            repository.remove(reviewSpaceId, legacy.id(), now);
        }
        return target.id();
    }

    private String removeTarget(String reviewSpaceId, ReviewRequirement legacy,
                                ReviewRequirement target, long now) {
        repository.remove(reviewSpaceId, target.id(), now);
        if (legacy != null && !legacy.id().equals(target.id())) {
            repository.remove(reviewSpaceId, legacy.id(), now);
        }
        return target.id();
    }

    private String removeLegacy(String reviewSpaceId, ReviewRequirement legacy, long now) {
        if (legacy != null) {
            repository.remove(reviewSpaceId, legacy.id(), now);
        }
        return null;
    }

    private String compilerContext(ReviewRequirementRepository.Draft draft, DraftCommand command,
                                   List<ReviewRequirement> current) {
        StringBuilder context = new StringBuilder(8_192);
        context.append("新候选\n用户原始诉求：\n")
                .append(optionalText(command.sourceText(), MAX_COMPILER_ITEM_LENGTH))
                .append("\n\nAI 分析：\n")
                .append(optionalText(command.analysisText(), MAX_COMPILER_ITEM_LENGTH))
                .append("\n\n候选标题：").append(draft.title())
                .append("\n候选说明：\n").append(truncate(draft.content(), MAX_COMPILER_ITEM_LENGTH))
                .append("\n\n当前有效需求：\n");
        current.stream().limit(MAX_COMPILER_REQUIREMENTS).forEach(item -> context
                .append("\nrequirementId=").append(item.id())
                .append("\n标题：").append(item.title())
                .append("\n说明：\n").append(truncate(item.content(), MAX_COMPILER_ITEM_LENGTH)).append('\n'));
        return context.toString();
    }

    private String optionalText(String value, int maxLength) {
        String normalized = value == null ? "" : value.trim();
        return truncate(normalized, maxLength);
    }

    private String truncate(String value, int maxLength) {
        return value.length() <= maxLength ? value : value.substring(0, maxLength);
    }

    private String validOrFallback(String value, String fallback, int maxLength) {
        String normalized = value == null ? "" : value.trim();
        return normalized.isEmpty() || normalized.length() > maxLength ? fallback : normalized;
    }

    private String requiredText(String value, int maxLength, String label) {
        String normalized = value == null ? "" : value.trim();
        if (normalized.isEmpty() || normalized.length() > maxLength) {
            throw badRequest(label + "不能为空且不能超过 " + maxLength + " 个字符");
        }
        return normalized;
    }

    private String boundedText(String value, int maxLength, String label) {
        String normalized = value == null ? "" : value.trim();
        if (normalized.length() > maxLength) {
            throw badRequest(label + "不能超过 " + maxLength + " 个字符");
        }
        return normalized;
    }

    private boolean validText(String value, int maxLength) {
        return value != null && !value.trim().isEmpty() && value.trim().length() <= maxLength;
    }

    private ResponseStatusException badRequest(String reason) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, reason);
    }

    /**
     * 自动同步需求草稿命令。
     *
     * @param sourceMessageId 来源轮次稳定指纹
     * @param title 需求标题
     * @param content 需求说明
     * @param sourceText 业务人员原始表述
     * @param analysisText AI 对该轮诉求的业务分析
     */
    public record DraftCommand(String sourceMessageId, String title, String content,
                               String sourceText, String analysisText) {
        public DraftCommand(String sourceMessageId, String title, String content) {
            this(sourceMessageId, title, content, "", content);
        }
    }

    /**
     * 人工修订需求条目命令。
     *
     * @param title 需求标题
     * @param content 需求说明
     * @param expectedRevision 客户端读取到的修订版本
     */
    public record UpdateCommand(String title, String content, long expectedRevision) {
    }

    private record Decision(ReviewRequirementCompiler.Operation operation,
                            ReviewRequirement target, String title, String content) {
        private static Decision create(ReviewRequirementRepository.Draft draft) {
            return new Decision(ReviewRequirementCompiler.Operation.CREATE,
                    null, draft.title(), draft.content());
        }
    }
}
