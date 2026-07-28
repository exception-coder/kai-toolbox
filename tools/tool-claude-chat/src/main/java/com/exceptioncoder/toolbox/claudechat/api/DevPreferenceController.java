package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.claudechat.service.DevPreferenceService;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/claude-chat/dev-preferences")
public class DevPreferenceController {

    private final DevPreferenceService service;

    public DevPreferenceController(DevPreferenceService service) {
        this.service = service;
    }

    @GetMapping("/{workbenchId}")
    public ResponseEntity<JsonNode> get(@PathVariable String workbenchId) {
        return service.get(workbenchId)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.noContent().build());
    }

    @PutMapping("/{workbenchId}")
    public JsonNode save(@PathVariable String workbenchId, @RequestBody JsonNode preference) {
        return service.save(workbenchId, preference);
    }
}
