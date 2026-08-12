package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.domain.SessionCustomSite;
import com.exceptioncoder.toolbox.claudechat.domain.SessionSiteConfiguration;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import com.exceptioncoder.toolbox.claudechat.repository.SessionSiteRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.net.URI;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

/** 管理会话关联快捷站点的读取、替换与清理。 */
@Service("claudeChatSessionSiteService")
public class SessionSiteService {

    private static final int MAX_SITE_COUNT = 20;
    private static final int MAX_SITE_ID_LENGTH = 100;
    private static final int MAX_TITLE_LENGTH = 100;
    private static final int MAX_URL_LENGTH = 2000;

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
     * 读取会话的快捷站点关联和临时站点。
     *
     * @param sessionId 逻辑会话 ID
     * @return 会话不存在时为空，否则返回聚合配置
     */
    public Optional<SessionSiteConfiguration> getConfiguration(String sessionId) {
        if (sessionRepository.findById(sessionId).isEmpty()) {
            return Optional.empty();
        }
        return Optional.of(new SessionSiteConfiguration(
                siteRepository.findSiteIds(sessionId),
                siteRepository.findCustomSites(sessionId)));
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
        List<String> normalized = normalizeQuickSiteIds(siteIds).stream()
                .limit(MAX_SITE_COUNT)
                .toList();
        siteRepository.replace(sessionId, normalized, System.currentTimeMillis());
        return true;
    }

    /**
     * 原子替换会话的两种测试站点，避免部分保存。
     *
     * @param sessionId 逻辑会话 ID
     * @param configuration 用户提交的完整配置
     * @return 会话存在时返回 true
     */
    @Transactional
    public boolean replaceConfiguration(String sessionId, SessionSiteConfiguration configuration) {
        if (sessionRepository.findById(sessionId).isEmpty()) {
            return false;
        }
        List<String> quickSiteIds = normalizeQuickSiteIds(
                configuration == null ? null : configuration.quickSiteIds());
        List<SessionCustomSite> customSites = normalizeCustomSites(
                configuration == null ? null : configuration.customSites());
        if (quickSiteIds.size() + customSites.size() > MAX_SITE_COUNT) {
            throw new IllegalArgumentException("每个会话最多关联 20 个测试站点");
        }
        long now = System.currentTimeMillis();
        siteRepository.replace(sessionId, quickSiteIds, now);
        siteRepository.replaceCustomSites(sessionId, customSites, now);
        return true;
    }

    /** 删除会话时清理其全部站点关联。 */
    @Transactional
    public void clear(String sessionId) {
        siteRepository.deleteBySessionId(sessionId);
    }

    private List<String> normalizeQuickSiteIds(List<String> siteIds) {
        return siteIds == null ? List.of() : siteIds.stream()
                .filter(siteId -> siteId != null && !siteId.isBlank())
                .map(String::trim)
                .distinct()
                .toList();
    }

    private List<SessionCustomSite> normalizeCustomSites(List<SessionCustomSite> customSites) {
        if (customSites == null) {
            return List.of();
        }
        Map<String, SessionCustomSite> uniqueSites = new LinkedHashMap<>();
        for (SessionCustomSite site : customSites) {
            if (site == null) {
                throw new IllegalArgumentException("临时站点不能为空");
            }
            String id = requireText(site.id(), "临时站点 ID", MAX_SITE_ID_LENGTH);
            String title = requireText(site.title(), "临时站点标题", MAX_TITLE_LENGTH);
            String siteUrl = requireText(site.siteUrl(), "临时站点地址", MAX_URL_LENGTH);
            validateHttpUrl(siteUrl);
            uniqueSites.putIfAbsent(id, new SessionCustomSite(id, title, siteUrl));
        }
        return List.copyOf(uniqueSites.values());
    }

    private String requireText(String value, String fieldName, int maxLength) {
        String normalized = value == null ? "" : value.trim();
        if (normalized.isEmpty()) {
            throw new IllegalArgumentException(fieldName + "不能为空");
        }
        if (normalized.length() > maxLength) {
            throw new IllegalArgumentException(fieldName + "不能超过 " + maxLength + " 个字符");
        }
        return normalized;
    }

    private void validateHttpUrl(String siteUrl) {
        try {
            URI uri = URI.create(siteUrl);
            String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
            if (!("http".equals(scheme) || "https".equals(scheme))
                    || uri.getRawAuthority() == null || uri.getRawAuthority().isBlank()) {
                throw new IllegalArgumentException("临时站点地址仅支持完整的 HTTP/HTTPS 地址");
            }
            if (uri.getRawUserInfo() != null) {
                throw new IllegalArgumentException("临时站点地址不能包含用户名或密码");
            }
        } catch (IllegalArgumentException exception) {
            if (exception.getMessage() != null && exception.getMessage().startsWith("临时站点地址")) {
                throw exception;
            }
            throw new IllegalArgumentException("临时站点地址格式不正确", exception);
        }
    }
}
