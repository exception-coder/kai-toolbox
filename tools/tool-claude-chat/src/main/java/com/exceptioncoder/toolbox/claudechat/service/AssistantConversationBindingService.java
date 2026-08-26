package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.domain.ClaudeChatSession;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;

/** 解析或原子创建当前用户、来源系统和页面 URL 对应的彩虹胶囊会话。 */
@Service
public class AssistantConversationBindingService {
    private static final int MAX_IDENTITY_LENGTH = 2_048;

    private final ClaudeChatSessionRepository sessions;

    public AssistantConversationBindingService(ClaudeChatSessionRepository sessions) {
        this.sessions = sessions;
    }

    /**
     * 若同一三元绑定已存在则返回既有会话，否则插入候选会话。
     *
     * @param candidate 已带认证用户与咨询执行策略的候选会话
     * @return 实际绑定会话及是否由本次创建
     */
    public Resolution resolveOrCreate(ClaudeChatSession candidate) {
        String appId = normalize(candidate.getAssistantAppId());
        String pageKey = normalize(candidate.getAssistantPageKey());
        String pageUrl = normalize(candidate.getAssistantPageUrl());
        Long userId = candidate.getUserId();
        if (userId == null || appId == null || pageKey == null) {
            sessions.insert(candidate);
            return new Resolution(candidate, true);
        }
        candidate.setAssistantAppId(appId);
        candidate.setAssistantPageKey(pageKey);
        candidate.setAssistantPageUrl(pageUrl == null ? pageKey : pageUrl);
        var existing = sessions.findAssistantConversation(userId, appId, pageKey);
        if (existing.isPresent()) {
            return new Resolution(existing.get(), false);
        }
        try {
            sessions.insert(candidate);
            return new Resolution(candidate, true);
        } catch (DataIntegrityViolationException conflict) {
            ClaudeChatSession winner = sessions.findAssistantConversation(userId, appId, pageKey)
                    .orElseThrow(() -> conflict);
            return new Resolution(winner, false);
        }
    }

    private String normalize(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String normalized = value.trim();
        if (normalized.length() > MAX_IDENTITY_LENGTH) {
            throw new IllegalArgumentException("Assistant 页面标识长度不能超过 " + MAX_IDENTITY_LENGTH + " 个字符");
        }
        return normalized;
    }

    /** 固定会话解析结果。 */
    public record Resolution(ClaudeChatSession session, boolean created) { }
}
