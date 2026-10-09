package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.claudechat.service.codexsync.CodexDesktopSyncService;
import com.exceptioncoder.toolbox.common.auth.annotation.RequireRole;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import static com.exceptioncoder.toolbox.claudechat.service.codexsync.CodexSyncModels.*;

/** Local Codex accounts are host-private resources, not other users' history sources. */
@RestController
@RequireRole("ADMIN")
@RequestMapping("/api/claude-chat/codex/desktop")
public class CodexDesktopSyncController {
    private final CodexDesktopSyncService service;
    public CodexDesktopSyncController(CodexDesktopSyncService service) { this.service = service; }

    @GetMapping("/projects")
    public ProjectPage projects(@RequestParam String codexHome, @RequestParam(required = false) String cursor) {
        return service.projects(codexHome, cursor);
    }

    @GetMapping("/threads")
    public ThreadPage threads(@RequestParam String codexHome, @RequestParam(required = false) String cursor,
                              @RequestParam(required = false) String projectId) {
        return service.threads(codexHome, cursor, projectId);
    }

    @PostMapping("/import")
    public ImportResult importThreads(@RequestBody ImportRequest request) { return service.importThreads(request); }
}
