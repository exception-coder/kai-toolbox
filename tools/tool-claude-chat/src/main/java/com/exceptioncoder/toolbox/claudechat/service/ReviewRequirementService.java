package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.domain.ReviewRequirement;
import com.exceptioncoder.toolbox.claudechat.domain.ReviewSpace;
import com.exceptioncoder.toolbox.claudechat.repository.ReviewRequirementRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

/** 维护公开计划评审中可由评审员确认修订的当前需求清单。 */
@Service
public class ReviewRequirementService {
    private static final int MAX_SYNC_ITEMS = 100;
    private static final int MAX_TITLE_LENGTH = 120;
    private static final int MAX_CONTENT_LENGTH = 10_000;
    private static final String SOURCE_ID_PREFIX = "assistant-content-v1:";

    private final ReviewSpaceService reviewSpaceService;
    private final ReviewRequirementRepository repository;

    public ReviewRequirementService(ReviewSpaceService reviewSpaceService,
                                    ReviewRequirementRepository repository) {
        this.reviewSpaceService = reviewSpaceService;
        this.repository = repository;
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
        List<ReviewRequirementRepository.Draft> drafts = commands.stream()
                .map(this::validatedDraft)
                .toList();
        repository.insertMissing(space.id(), drafts, System.currentTimeMillis());
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
        return new ReviewRequirementRepository.Draft(command.sourceMessageId(),
                requiredText(command.title(), MAX_TITLE_LENGTH, "需求标题"),
                requiredText(command.content(), MAX_CONTENT_LENGTH, "需求说明"));
    }

    private String requiredText(String value, int maxLength, String label) {
        String normalized = value == null ? "" : value.trim();
        if (normalized.isEmpty() || normalized.length() > maxLength) {
            throw badRequest(label + "不能为空且不能超过 " + maxLength + " 个字符");
        }
        return normalized;
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
     */
    public record DraftCommand(String sourceMessageId, String title, String content) {
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
}
