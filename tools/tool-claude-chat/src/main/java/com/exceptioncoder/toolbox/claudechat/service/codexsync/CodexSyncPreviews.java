package com.exceptioncoder.toolbox.claudechat.service.codexsync;

import com.exceptioncoder.toolbox.common.auth.web.AuthContext;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

import static org.springframework.http.HttpStatus.CONFLICT;
import static org.springframework.http.HttpStatus.BAD_REQUEST;

/** Short-lived server-authoritative metadata; client requests cannot substitute paths or handles. */
@Component
public class CodexSyncPreviews {
    private static final long TTL_MILLIS = 10 * 60 * 1000;
    private static final int MAX_PAGES = 128;
    private final Map<String, Preview> pages = new LinkedHashMap<>();
    private final java.util.function.LongSupplier clock;

    public CodexSyncPreviews() { this(System::currentTimeMillis); }
    CodexSyncPreviews(java.util.function.LongSupplier clock) { this.clock = clock; }

    public synchronized String save(String home, CodexSyncModels.Project project, List<CodexSyncModels.Thread> threads) {
        return save(home, project, project == null ? null : "native", threads);
    }

    public synchronized String save(String home, CodexSyncModels.Project project, String projectMatch, List<CodexSyncModels.Thread> threads) {
        long now = clock.getAsLong();
        pages.values().removeIf(page -> page.expiresAt() <= now);
        while (pages.size() >= MAX_PAGES) pages.remove(pages.keySet().iterator().next());
        String token = UUID.randomUUID().toString();
        pages.put(token, new Preview(home, project, projectMatch, List.copyOf(threads), owner(), now + TTL_MILLIS));
        return token;
    }

    public synchronized Preview require(CodexSyncModels.ImportRequest request) {
        if (request.threadIds() == null || request.threadIds().isEmpty() || request.threadIds().size() > 50) {
            throw new ResponseStatusException(BAD_REQUEST, "每次请选择 1～50 个会话");
        }
        Preview page = pages.get(request.previewToken());
        if (page == null || page.expiresAt() <= clock.getAsLong() || !Objects.equals(page.owner(), owner())) {
            throw new ResponseStatusException(CONFLICT, "同步预览已失效，请刷新后重新选择");
        }
        if (request.threadIds().stream().anyMatch(id -> page.threads().stream().noneMatch(thread -> thread.id().equals(id)))) {
            throw new ResponseStatusException(BAD_REQUEST, "所选会话不在当前预览中，请刷新后重新选择");
        }
        return page;
    }

    static Long owner() { return AuthContext.current().map(principal -> principal.userId()).orElse(null); }
    public record Preview(String home, CodexSyncModels.Project project, String projectMatch, List<CodexSyncModels.Thread> threads,
                          Long owner, long expiresAt) { }
}
