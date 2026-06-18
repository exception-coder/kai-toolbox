package com.exceptioncoder.toolbox.aisecretary.service;

import com.exceptioncoder.toolbox.aisecretary.ai.MemoryProposal;
import com.exceptioncoder.toolbox.aisecretary.ai.ProfileExtractor;
import com.exceptioncoder.toolbox.aisecretary.domain.Memory;
import com.exceptioncoder.toolbox.aisecretary.domain.MemoryCategory;
import com.exceptioncoder.toolbox.aisecretary.domain.MemoryStatus;
import com.exceptioncoder.toolbox.aisecretary.repository.MemoryRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.List;
import java.util.UUID;

/**
 * 长期记忆核心：「LLM 提议 · 代码裁决 · 提议待确认」。
 *
 * <ul>
 *   <li>{@link #proposeFrom} 异步从文本提炼候选 → 校验/归一/去重 → 入 {@code PROPOSED}；</li>
 *   <li>用户在面板 {@link #update}（置 ACTIVE = 确认）/ {@link #manualAdd} / {@link #delete}；</li>
 *   <li>注入只取 ACTIVE（见 MemoryContextBuilder），proposed 永不进 prompt。</li>
 * </ul>
 */
@Service
public class MemoryService {

    private static final Logger log = LoggerFactory.getLogger(MemoryService.class);
    private static final String CATEGORY_LABELS = MemoryCategory.labelsCsv();

    private final ProfileExtractor extractor;
    private final MemoryRepository repo;

    public MemoryService(ProfileExtractor extractor, MemoryRepository repo) {
        this.extractor = extractor;
        this.repo = repo;
    }

    /** 异步提炼入口：从一段文本（记录原文 / 问答）提议画像记忆。失败静默降级，绝不影响主链路。 */
    public void proposeFrom(String text) {
        if (!StringUtils.hasText(text)) {
            return;
        }
        try {
            MemoryProposal proposal = extractor.propose(CATEGORY_LABELS, text.trim());
            adjudicate(proposal);
        } catch (Exception e) {
            log.debug("[ai-secretary] 记忆提炼失败（忽略）：{}", e.toString());
        }
    }

    /** 代码裁决：校验类目/键、按 (category,key) 去重，合法者入 PROPOSED。 */
    private void adjudicate(MemoryProposal proposal) {
        if (proposal == null || proposal.items() == null) {
            return;
        }
        long now = System.currentTimeMillis();
        for (MemoryProposal.MemoryCandidate c : proposal.items()) {
            MemoryCategory category = MemoryCategory.fromLabel(c.category());
            String key = c.key() == null ? "" : c.key().trim();
            String value = c.value() == null ? "" : c.value().trim();
            if (category == null || key.isEmpty() || value.isEmpty()) {
                continue; // 非法候选丢弃
            }
            // 去重：同类同 key 已存在（任意状态）→ 不重复提议，避免每轮刷屏
            if (repo.findByCategoryAndKey(category, key) != null) {
                continue;
            }
            double confidence = c.confidence() == null ? 0.0 : c.confidence();
            repo.insert(new Memory(
                    UUID.randomUUID().toString(), category, key, value,
                    StringUtils.hasText(c.detail()) ? c.detail().trim() : null,
                    null, confidence, MemoryStatus.PROPOSED, false, now, now));
        }
    }

    public List<Memory> listByStatus(MemoryStatus status) {
        return repo.listByStatus(status);
    }

    /** 手动新增（直接 active）。 */
    public Memory manualAdd(MemoryCategory category, String key, String value, String detail, boolean pinned) {
        if (category == null || !StringUtils.hasText(key) || !StringUtils.hasText(value)) {
            throw new IllegalArgumentException("category / key / value 不能为空");
        }
        long now = System.currentTimeMillis();
        Memory m = new Memory(UUID.randomUUID().toString(), category, key.trim(), value.trim(),
                StringUtils.hasText(detail) ? detail.trim() : null, null, 1.0,
                MemoryStatus.ACTIVE, pinned, now, now);
        repo.insert(m);
        return m;
    }

    /**
     * 局部更新：传入非 null 字段才改。把 status 置 ACTIVE 即「确认」一条 proposed。
     */
    public Memory update(String id, MemoryCategory category, String key, String value,
                         String detail, Boolean pinned, MemoryStatus status) {
        Memory cur = repo.findById(id);
        if (cur == null) {
            throw new IllegalArgumentException("记忆不存在：" + id);
        }
        Memory next = new Memory(
                cur.id(),
                category != null ? category : cur.category(),
                StringUtils.hasText(key) ? key.trim() : cur.key(),
                StringUtils.hasText(value) ? value.trim() : cur.value(),
                detail != null ? (detail.isBlank() ? null : detail.trim()) : cur.detail(),
                cur.sourceNoteId(),
                cur.confidence(),
                status != null ? status : cur.status(),
                pinned != null ? pinned : cur.pinned(),
                cur.createdAt(),
                System.currentTimeMillis());
        repo.update(next);
        return next;
    }

    public void delete(String id) {
        repo.deleteById(id);
    }
}
