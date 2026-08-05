package com.exceptioncoder.toolbox.quicklaunch.service;

import com.exceptioncoder.toolbox.quicklaunch.api.dto.QuickSiteUpsertRequest;
import com.exceptioncoder.toolbox.quicklaunch.api.dto.QuickSiteView;
import com.exceptioncoder.toolbox.quicklaunch.domain.OpenMode;
import com.exceptioncoder.toolbox.quicklaunch.domain.QuickSite;
import com.exceptioncoder.toolbox.quicklaunch.repository.QuickSiteRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

@Service
public class QuickLaunchService {

    static final String DEFAULT_GROUP = "未分组";
    static final String DEFAULT_ICON = "Globe2";
    static final int DEFAULT_WINDOW_WIDTH = 1400;
    static final int DEFAULT_WINDOW_HEIGHT = 900;

    private final QuickSiteRepository repository;

    public QuickLaunchService(QuickSiteRepository repository) {
        this.repository = repository;
    }

    public List<QuickSiteView> list() {
        return repository.findAll().stream().map(QuickSiteView::from).toList();
    }

    public QuickSiteView create(QuickSiteUpsertRequest request) {
        long now = System.currentTimeMillis();
        QuickSite site = buildSite(UUID.randomUUID().toString(), request, 0, null, now, now);
        repository.insert(site);
        return QuickSiteView.from(site);
    }

    public QuickSiteView update(String id, QuickSiteUpsertRequest request) {
        QuickSite existing = findRequired(id);
        QuickSite updated = buildSite(
                existing.id(), request, existing.openCount(), existing.lastOpenedAt(),
                existing.createdAt(), System.currentTimeMillis());
        repository.update(updated);
        return QuickSiteView.from(updated);
    }

    public void delete(String id) {
        repository.deleteById(id);
    }

    public void recordOpened(String id) {
        if (repository.recordOpened(id, System.currentTimeMillis()) == 0) {
            throw notFound(id);
        }
    }

    private QuickSite findRequired(String id) {
        return repository.findById(id).orElseThrow(() -> notFound(id));
    }

    private static QuickSite buildSite(
            String id,
            QuickSiteUpsertRequest request,
            long openCount,
            Long lastOpenedAt,
            long createdAt,
            long updatedAt
    ) {
        return new QuickSite(
                id,
                request.title().trim(),
                validateUrl(request.siteUrl()),
                valueOrDefault(request.groupName(), DEFAULT_GROUP),
                valueOrDefault(request.icon(), DEFAULT_ICON),
                request.openMode() == null ? OpenMode.POPUP : request.openMode(),
                request.windowWidth() == null ? DEFAULT_WINDOW_WIDTH : request.windowWidth(),
                request.windowHeight() == null ? DEFAULT_WINDOW_HEIGHT : request.windowHeight(),
                request.sortOrder() == null ? 0 : request.sortOrder(),
                Boolean.TRUE.equals(request.pinned()),
                request.enabled() == null || request.enabled(),
                openCount,
                lastOpenedAt,
                createdAt,
                updatedAt
        );
    }

    static String validateUrl(String value) {
        String url = value == null ? "" : value.trim();
        try {
            URI uri = new URI(url);
            String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
            if (!("http".equals(scheme) || "https".equals(scheme))
                    || uri.getRawAuthority() == null
                    || uri.getRawAuthority().isBlank()) {
                throw invalidUrl();
            }
            if (uri.getUserInfo() != null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "站点地址不能包含用户名或密码");
            }
            return url;
        } catch (URISyntaxException exception) {
            throw invalidUrl();
        }
    }

    private static String valueOrDefault(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value.trim();
    }

    private static ResponseStatusException invalidUrl() {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, "站点地址必须是有效的 HTTP 或 HTTPS URL");
    }

    private static ResponseStatusException notFound(String id) {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, "快捷站点不存在: " + id);
    }
}
