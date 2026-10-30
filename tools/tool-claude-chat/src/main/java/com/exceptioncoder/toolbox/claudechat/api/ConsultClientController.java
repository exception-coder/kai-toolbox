package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import com.exceptioncoder.toolbox.claudechat.repository.ConsultRuntimeRepository;
import com.exceptioncoder.toolbox.claudechat.service.AttachmentStorageService;
import com.exceptioncoder.toolbox.claudechat.service.ConsultClientTickets;
import com.exceptioncoder.toolbox.claudechat.service.ConsultRuntimeCoordinator;
import com.exceptioncoder.toolbox.common.auth.annotation.RequireAuth;
import com.exceptioncoder.toolbox.llm.spi.ConsultClientApplication;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

/** HTTPS control plane; filenames and IDs are public, physical paths and runtime credentials are not. */
@RestController
@RequestMapping("/api/fore-consult/client")
@RequireAuth
public class ConsultClientController {

    private final ConsultClientTickets tickets;
    private final ConsultClientApplication application;
    private final AttachmentStorageService files;
    private final ClaudeChatSessionRepository sessions;
    private final ConsultRuntimeCoordinator coordinator;
    private final ConsultRuntimeRepository history;

    public ConsultClientController(
        ConsultClientTickets tickets,
        ConsultClientApplication application,
        AttachmentStorageService files,
        ClaudeChatSessionRepository sessions,
        ConsultRuntimeCoordinator coordinator,
        ConsultRuntimeRepository history
    ) {
        this.tickets = tickets;
        this.application = application;
        this.files = files;
        this.sessions = sessions;
        this.coordinator = coordinator;
        this.history = history;
    }

    @PostMapping("/tickets")
    public ConsultClientTickets.Issued ticket(HttpServletRequest request) {
        String origin = request.getScheme() + "://" + request.getServerName();
        if (
            !(request.getScheme().equals("https") &&
                request.getServerPort() == 443) &&
            !(request.getScheme().equals("http") &&
                request.getServerPort() == 80)
        ) origin += ":" + request.getServerPort();
        return tickets.issue(request.getHeader("Origin"), origin);
    }

    @GetMapping("/sessions/{id}/messages")
    public Map<String, Object> messages(
        @PathVariable String id,
        @RequestParam(required = false) Integer before,
        @RequestParam(defaultValue = "30") int limit
    ) {
        tickets.requireEnabled();
        var bound = application.require(id, false);
        coordinator.ensureHistory(
            sessions.findById(bound.runtimeId()).orElseThrow()
        );
        var page = history.messages(
            bound.runtimeId(),
            before,
            Math.max(1, Math.min(limit, 100))
        );
        var items = page
            .items()
            .stream()
            .filter(
                m -> "user".equals(m.kind()) || "assistant".equals(m.kind())
            )
            .map(m ->
                Map.of(
                    "id",
                    m.id(),
                    "role",
                    m.kind(),
                    "text",
                    "user".equals(m.kind())
                        ? com.exceptioncoder.toolbox.claudechat.service.ConsultClientMessageProjector.userText(
                              m.text()
                          )
                        : m.text() == null
                            ? ""
                            : m.text()
                )
            )
            .toList();
        var result = new java.util.LinkedHashMap<String, Object>();
        result.put("items", items);
        result.put("nextBefore", page.nextBefore());
        result.put("historyGap", page.historyGap());
        return result;
    }

    @PostMapping("/sessions/{id}/attachments")
    public Map<String, Object> upload(
        @PathVariable String id,
        @RequestPart("file") MultipartFile file
    ) throws java.io.IOException {
        tickets.requireEnabled();
        var bound = application.require(id, true);
        var value = files.store(bound.runtimeId(), file);
        return Map.of(
            "id",
            value.id(),
            "name",
            value.name(),
            "mime",
            value.mime(),
            "size",
            value.size()
        );
    }
}
