package com.exceptioncoder.toolbox.webterm.api;

import com.exceptioncoder.toolbox.webterm.api.dto.ClaudeSessionView;
import com.exceptioncoder.toolbox.webterm.api.dto.RegisterClaudeSessionRequest;
import com.exceptioncoder.toolbox.webterm.domain.ClaudeSession;
import com.exceptioncoder.toolbox.webterm.repository.ClaudeSessionRepository;
import com.exceptioncoder.toolbox.webterm.session.WebTermSession;
import com.exceptioncoder.toolbox.webterm.session.WebTermSessionRegistry;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * 已经进入过的 Claude 会话列表。
 *
 * - 元数据（cwd / shell / 标题 / 时间戳）走 SQLite 持久化，刷新 / 换客户端都保留；
 * - liveSessionId 反映这条记录当前在 {@link WebTermSessionRegistry} 里是否还有
 *   存活的 PTY 进程：非 null 时前端可直接 attach 接回原终端（看到所有历史输出），
 *   null 时前端只能用 `claude --continue` 重新拉起新进程。
 * - DELETE 同时砍掉持久记录 + 还在跑的 PTY，等同于用户主动「断开会话」。
 */
@RestController
@RequestMapping("/api/webterm/claude-sessions")
public class ClaudeSessionController {

    private final ClaudeSessionRepository repo;
    private final WebTermSessionRegistry liveRegistry;

    public ClaudeSessionController(ClaudeSessionRepository repo,
                                   WebTermSessionRegistry liveRegistry) {
        this.repo = repo;
        this.liveRegistry = liveRegistry;
    }

    /**
     * 返回完整的会话列表：
     *   1) DB 持久化的"曾经进过 Claude 的 cwd+shell"记录；
     *   2) 还在注册表里、但没对应 DB 记录的孤儿活 PTY（早期遗留 / 服务端去重之前堆积的）。
     * (1) 通过 cwd+shell 联查 liveRegistry 标 liveSessionId；
     * (2) 用合成 ClaudeSession 凑一行（id 用 "live:<sessionId>" 前缀让 DELETE 能识别）。
     * 这样前端列表能看到所有还活着的进程，方便用户主动断开。
     */
    @GetMapping
    public List<ClaudeSessionView> list() {
        List<ClaudeSessionView> out = new ArrayList<>();
        Set<String> seenLive = new HashSet<>();

        for (ClaudeSession dbSession : repo.findAll()) {
            String liveId = liveRegistry.findLiveBy(dbSession.getCwd(), dbSession.getShell())
                    .map(WebTermSession::getSessionId)
                    .orElse(null);
            if (liveId != null) seenLive.add(liveId);
            out.add(ClaudeSessionView.from(dbSession, liveId));
        }

        for (WebTermSession live : liveRegistry.listAll()) {
            if (seenLive.contains(live.getSessionId())) continue;
            ClaudeSession synthetic = ClaudeSession.builder()
                    .id("live:" + live.getSessionId())
                    .cwd(live.getCwd())
                    .shell(live.getShell())
                    .title(null)
                    .startedAt(live.getStartedAt())
                    .lastSeenAt(live.getStartedAt())
                    .build();
            out.add(ClaudeSessionView.from(synthetic, live.getSessionId()));
        }

        return out;
    }

    @PostMapping
    public ClaudeSessionView upsert(@Valid @RequestBody RegisterClaudeSessionRequest req) {
        long now = System.currentTimeMillis();
        String cwd = req.cwd().trim();
        String shell = req.shell().trim();
        Optional<ClaudeSession> existing = repo.findByCwdAndShell(cwd, shell);
        ClaudeSession s;
        if (existing.isPresent()) {
            s = existing.get();
            repo.touch(s.getId(), now);
            if (req.title() != null && !req.title().isBlank() && !req.title().equals(s.getTitle())) {
                repo.updateTitle(s.getId(), req.title());
                s.setTitle(req.title());
            }
            s.setLastSeenAt(now);
        } else {
            s = ClaudeSession.builder()
                    .id(UUID.randomUUID().toString())
                    .cwd(cwd)
                    .shell(shell)
                    .title(req.title())
                    .startedAt(now)
                    .lastSeenAt(now)
                    .build();
            repo.insert(s);
        }
        String liveId = liveRegistry.findLiveBy(cwd, shell)
                .map(WebTermSession::getSessionId).orElse(null);
        return ClaudeSessionView.from(s, liveId);
    }

    /**
     * id 的两种形态：
     *   - 普通 UUID：DB 行 id；先杀该 cwd+shell 对应的活 PTY（若有），再删行；
     *   - "live:&lt;sessionId&gt;"：合成 id，对应只有活 PTY、没有 DB 行的孤儿，只杀进程。
     */
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable String id) {
        if (id.startsWith("live:")) {
            String sessionId = id.substring("live:".length());
            WebTermSession live = liveRegistry.findById(sessionId);
            if (live != null) live.close();
            return ResponseEntity.noContent().build();
        }
        repo.findAll().stream()
                .filter(s -> s.getId().equals(id))
                .findFirst()
                .ifPresent(s -> liveRegistry.findLiveBy(s.getCwd(), s.getShell())
                        .ifPresent(WebTermSession::close));
        repo.deleteById(id);
        return ResponseEntity.noContent().build();
    }
}
