package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.common.auth.annotation.RequireAuth;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Set;

/** Limited browser timing events for diagnosing slow Vibe Coding entry. */
@Slf4j
@RequireAuth
@RestController
@RequestMapping("/api/claude-chat/diagnostics/entry")
public class VibeEntryDiagnosticController {
    private static final Set<String> STAGES = Set.of(
            "app_mount", "shell_mount", "chat_engine_mount", "page_mount",
            "session_lookup", "session_switch", "session_ready",
            "history_latest", "history_earlier", "html_response", "resource_summary", "bootstrap_timeout");
    private static final Set<String> STATUSES = Set.of("start", "ok", "timeout", "error");

    @PostMapping
    public ResponseEntity<Void> record(@RequestBody EntryTiming timing) {
        if (timing == null || timing.traceId() == null
                || !isUuid(timing.traceId())
                || timing.stage() == null || !STAGES.contains(timing.stage())
                || timing.status() == null || !STATUSES.contains(timing.status())
                || timing.elapsedMs() < 0 || timing.elapsedMs() > 600_000
                || (timing.sessionId() != null && !isUuid(timing.sessionId()))
                || !validResources(timing.stage(), timing.resources())) {
            return ResponseEntity.badRequest().build();
        }
        if (timing.resources() == null) {
            log.info("[vibe-entry] trace={} stage={} status={} elapsedMs={} session={}",
                    timing.traceId(), timing.stage(), timing.status(), timing.elapsedMs(), timing.sessionId());
        } else {
            ResourceSummary r = timing.resources();
            log.info("[vibe-entry] trace={} stage={} status={} elapsedMs={} chatModules={} otherFeatureModules={} commonModules={} transferBytes={} lastModuleMs={} slowestModuleMs={}",
                    timing.traceId(), timing.stage(), timing.status(), timing.elapsedMs(), r.chatModules(),
                    r.otherFeatureModules(), r.commonModules(), r.transferBytes(), r.lastModuleMs(), r.slowestModuleMs());
        }
        return ResponseEntity.noContent().build();
    }

    private static boolean validResources(String stage, ResourceSummary resources) {
        if (resources == null) return true;
        return "resource_summary".equals(stage)
                && resources.chatModules() >= 0 && resources.chatModules() <= 5_000
                && resources.otherFeatureModules() >= 0 && resources.otherFeatureModules() <= 5_000
                && resources.commonModules() >= 0 && resources.commonModules() <= 5_000
                && resources.transferBytes() >= 0 && resources.transferBytes() <= 1_000_000_000
                && resources.lastModuleMs() >= 0 && resources.lastModuleMs() <= 600_000
                && resources.slowestModuleMs() >= 0 && resources.slowestModuleMs() <= 600_000;
    }

    private static boolean isUuid(String value) {
        return value.matches("[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}");
    }

    public record EntryTiming(String traceId, String stage, String status, long elapsedMs, String sessionId,
                              ResourceSummary resources) {
        public EntryTiming(String traceId, String stage, String status, long elapsedMs, String sessionId) {
            this(traceId, stage, status, elapsedMs, sessionId, null);
        }
    }

    public record ResourceSummary(int chatModules, int otherFeatureModules, int commonModules,
                                  long transferBytes, long lastModuleMs, long slowestModuleMs) { }
}
