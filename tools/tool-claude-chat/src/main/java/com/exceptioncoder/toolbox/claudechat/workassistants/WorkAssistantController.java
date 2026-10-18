package com.exceptioncoder.toolbox.claudechat.workassistants;

import com.exceptioncoder.toolbox.common.auth.annotation.RequireAuth;
import org.springframework.web.bind.annotation.*;
import java.util.Map;

/** 工作助理公开入口：不接收任意 Skill 路径、终端命令或执行权限声明。 */
@RestController
@RequireAuth
@RequestMapping("/api/work-assistants")
public class WorkAssistantController {
    private final AssistantConversationService conversations;
    private final AssistantCatalog catalog;
    private final AssistantEvidence evidence;

    public WorkAssistantController(AssistantConversationService conversations, AssistantCatalog catalog,
                                    AssistantEvidence evidence) {
        this.conversations = conversations;
        this.catalog = catalog;
        this.evidence = evidence;
    }

    @GetMapping("/catalog")
    public Object catalog() {
        var owner = conversations.user();
        return Map.of("assistants", catalog.list().stream().map(value -> Map.of("id", value.id(),
                "name", value.name(), "description", value.description(), "skill", value.skill(),
                "skillHash", value.hash(), "enabled", !value.id().equals("resources") || owner.hasAnyRole("ADMIN"))).toList(),
                "projects", evidence.projects());
    }

    @GetMapping("/sessions") public Object list() { return conversations.list(); }
    @PostMapping("/sessions") public Object create(@RequestBody AssistantConversationService.Create command) {
        return conversations.create(command);
    }
    @GetMapping("/sessions/{id}") public Object read(@PathVariable String id) { return conversations.read(id); }
    @PostMapping("/sessions/{id}/messages") public Object send(@PathVariable String id,
            @RequestBody AssistantConversationService.Message command) { return conversations.submit(id, command); }
    @PostMapping("/sessions/{id}/turns/{turn}/cancel") public void cancel(@PathVariable String id,
            @PathVariable String turn) { conversations.cancel(id, turn); }
}
