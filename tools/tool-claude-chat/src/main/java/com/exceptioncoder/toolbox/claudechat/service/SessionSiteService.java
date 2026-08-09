package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import com.exceptioncoder.toolbox.claudechat.repository.SessionSiteRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/** 管理会话关联快捷站点的读取、替换与清理。 */
@Service("claudeChatSessionSiteService")
public class SessionSiteService {

    private static final int MAX_SITE_COUNT = 20;

    private final ClaudeChatSessionRepository sessionRepository;
    private final SessionSiteRepository siteRepository;

    public SessionSiteService(ClaudeChatSessionRepository sessionRepository,
                              SessionSiteRepository siteRepository) {
        this.sessionRepository = sessionRepository;
        this.siteRepository = siteRepository;
    }

    /**
     * 读取已存在会话的关联站点。
     *
     * @param sessionId 逻辑会话 ID
     * @return 会话不存在时返回空结果
     */
    public List<String> listSiteIds(String sessionId) {
        if (sessionRepository.findById(sessionId).isEmpty()) {
            return List.of();
        }
        return siteRepository.findSiteIds(sessionId);
    }

    /**
     * 替换会话关联，自动去空、去重并限制数量。
     *
     * @param sessionId 逻辑会话 ID
     * @param siteIds 快捷站点 ID 列表
     * @return 会话存在时返回 true
     */
    @Transactional
    public boolean replace(String sessionId, List<String> siteIds) {
        if (sessionRepository.findById(sessionId).isEmpty()) {
            return false;
        }
        List<String> normalized = siteIds == null ? List.of() : siteIds.stream()
                .filter(siteId -> siteId != null && !siteId.isBlank())
                .map(String::trim)
                .distinct()
                .limit(MAX_SITE_COUNT)
                .toList();
        siteRepository.replace(sessionId, normalized, System.currentTimeMillis());
        return true;
    }

    /** 删除会话时清理其全部站点关联。 */
    public void clear(String sessionId) {
        siteRepository.deleteBySessionId(sessionId);
    }
}
