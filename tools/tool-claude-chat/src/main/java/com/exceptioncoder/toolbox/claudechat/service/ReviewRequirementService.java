package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.ai.ReviewRequirementCompiler;
import com.exceptioncoder.toolbox.claudechat.domain.ReviewRequirement;
import com.exceptioncoder.toolbox.claudechat.repository.ReviewRequirementRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

/** AI 产生候选，人主动加入并确认；不自动归并或覆盖现有需求。 */
@Service
public class ReviewRequirementService {
    private final ReviewSpaceService spaces;
    private final ReviewRequirementRepository repository;

    public ReviewRequirementService(ReviewSpaceService spaces, ReviewRequirementRepository repository,
                                    ReviewRequirementCompiler compiler) {
        this.spaces = spaces;
        this.repository = repository;
    }

    public List<ReviewRequirement> list(String token) {
        return repository.findByReviewSpaceId(space(token));
    }
    public Backlog backlog(String token) {
        String id = space(token);
        return new Backlog(repository.findByReviewSpaceId(id), repository.processedSources(id));
    }
    public record Backlog(List<ReviewRequirement> items, List<String> processedSources) { }

    /** 兼容既有同步端点，但只按用户明确提交的候选新增，不运行隐式归并模型。 */
    @Transactional
    public List<ReviewRequirement> synchronize(String token, List<DraftCommand> commands) {
        String space = space(token);
        if (commands == null || commands.size() > 100) throw invalid("单次加入数量不合法");
        for (DraftCommand item : commands) {
            if (item == null || item.sourceMessageId() == null || !item.sourceMessageId().startsWith("assistant-content-v1:")
                    || item.sourceMessageId().length() > 200) throw invalid("需求来源消息标识不合法");
            String title = text(item.title(), 120, "需求标题");
            String content = text(item.content(), 10_000, "需求说明");
            if (repository.hasProcessedSource(space, item.sourceMessageId())) continue;
            long now = System.currentTimeMillis();
            String id = repository.insertRequirement(space, new ReviewRequirementRepository.Draft(item.sourceMessageId(), title, content), now);
            repository.insertSource(space, id, new ReviewRequirementRepository.Source(item.sourceMessageId(),
                    bounded(item.sourceText(), 10_000), bounded(item.analysisText(), 10_000), "CREATE"), now);
        }
        return repository.findByReviewSpaceId(space);
    }

    /** 旧页面也不得用重新审核清空人工清单及提交依据。 */
    public List<ReviewRequirement> rebuild(String token, List<DraftCommand> commands) {
        space(token);
        throw conflict("请从讨论中选择候选加入清单；不再清空人工需求");
    }

    @Transactional
    public ReviewRequirement update(String token, String id, UpdateCommand command) {
        String space = space(token);
        if (command == null || command.expectedRevision() < 1) throw invalid("需求修订版本不合法");
        if (!repository.update(space, id, new ReviewRequirementRepository.Update(text(command.title(), 120, "需求标题"),
                text(command.content(), 10_000, "需求说明"), command.expectedRevision()), System.currentTimeMillis())) {
            throw conflict("需求已更新，请刷新后重试");
        }
        return find(space, id);
    }

    @Transactional
    public ReviewRequirement confirm(String token, String id, long revision, boolean confirmed) {
        String space = space(token);
        ReviewRequirement current = find(space, id);
        if (current.revision() != revision) throw conflict("需求已更新，请重新核对确认");
        if (confirmed && !completeContent(current.content())) throw invalid("请先补全问题、预期行为和验收标准");
        if (!repository.confirm(space, id, revision, confirmed, System.currentTimeMillis())) throw conflict("需求已更新，请重新核对确认");
        return find(space, id);
    }

    @Transactional
    public List<ReviewRequirement> merge(String token, String targetId, String sourceId, long targetRevision,
                                          long sourceRevision, String title, String content) {
        String space = space(token);
        if (targetId == null || targetId.equals(sourceId)) throw invalid("请选择两个不同的需求");
        ReviewRequirement target = find(space, targetId);
        ReviewRequirement source = find(space, sourceId);
        if (target.revision() != targetRevision || source.revision() != sourceRevision) throw conflict("需求已更新，请刷新后合并");
        long now = System.currentTimeMillis();
        if (!repository.update(space, targetId, new ReviewRequirementRepository.Update(text(title, 120, "需求标题"),
                text(content, 10_000, "合并说明"), targetRevision), now)
                || !repository.removeExpected(space, sourceId, sourceRevision, now)) throw conflict("需求状态已变化");
        repository.moveSources(space, sourceId, targetId, now);
        return repository.findByReviewSpaceId(space);
    }

    @Transactional
    public void delete(String token, String id) { repository.remove(space(token), id, System.currentTimeMillis()); }

    private String space(String token) {
        return spaces.resolve(token).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "评审链接已失效")).id();
    }
    private ReviewRequirement find(String space, String id) {
        return repository.findByReviewSpaceId(space).stream().filter(item -> item.id().equals(id)).findFirst()
                .orElseThrow(() -> conflict("需求不属于当前评审或已被移除"));
    }
    private static String text(String value, int max, String label) {
        String result = bounded(value, max);
        if (result.isBlank()) throw invalid(label + "不能为空");
        return result;
    }
    private static boolean completeContent(String content) {
        for (String heading : List.of("类型", "问题", "预期行为", "验收标准")) {
            var matcher = java.util.regex.Pattern.compile("(?m)^#{1,4}\\s+" + heading + "\\s*\\R([\\s\\S]*?)(?=^#{1,4}\\s|\\z)").matcher(content);
            if (!matcher.find() || matcher.group(1).isBlank()) return false;
        }
        return true;
    }
    private static String bounded(String value, int max) {
        String result = value == null ? "" : value.trim();
        if (result.length() > max) throw invalid("内容过长，请精简后重试");
        return result;
    }
    private static ResponseStatusException invalid(String message) { return new ResponseStatusException(HttpStatus.BAD_REQUEST, message); }
    private static ResponseStatusException conflict(String message) { return new ResponseStatusException(HttpStatus.CONFLICT, message); }
    public record DraftCommand(String sourceMessageId, String title, String content, String sourceText, String analysisText) {
        public DraftCommand(String sourceMessageId, String title, String content) { this(sourceMessageId, title, content, "", content); }
    }
    public record UpdateCommand(String title, String content, long expectedRevision) { }
}
