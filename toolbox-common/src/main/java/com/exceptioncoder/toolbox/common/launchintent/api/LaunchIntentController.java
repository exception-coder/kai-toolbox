package com.exceptioncoder.toolbox.common.launchintent.api;

import com.exceptioncoder.toolbox.common.launchintent.domain.LaunchIntent;
import com.exceptioncoder.toolbox.common.launchintent.service.LaunchIntentService;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.Set;

/** LaunchIntent HTTP 协议适配器。 */
@RestController
@RequestMapping("/api/launch-intents")
public class LaunchIntentController {

    private static final Set<String> SUPPORTED_ENGINES = Set.of(
            "claude", "codex", "antigravity", "opencode", "deepseekHarness");
    private static final Set<String> SUPPORTED_PANELS = Set.of(
            "clone", "taskspace", "new", "filetree", "onboard",
            "caps", "providers", "plugins", "settings", "sessions");

    private final LaunchIntentService service;
    private final ObjectMapper objectMapper;

    public LaunchIntentController(LaunchIntentService service, ObjectMapper objectMapper) {
        this.service = service;
        this.objectMapper = objectMapper;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public LaunchIntentView create(@Valid @RequestBody CreateLaunchIntentRequest request)
            throws JsonProcessingException {
        validatePayload(request.type(), request.payload());
        LaunchIntent intent = service.create(
                request.protocolVersion(), request.type(), objectMapper.writeValueAsString(request.payload()));
        return toView(intent);
    }

    @GetMapping("/{id}")
    public LaunchIntentView get(@PathVariable String id) throws JsonProcessingException {
        return toView(service.getExecutable(id));
    }

    @PostMapping("/{id}/ack")
    public LaunchIntentView ack(@PathVariable String id) throws JsonProcessingException {
        return toView(service.acknowledge(id));
    }

    @PostMapping("/{id}/fail")
    public LaunchIntentView fail(@PathVariable String id,
                                 @Valid @RequestBody FailLaunchIntentRequest request)
            throws JsonProcessingException {
        return toView(service.fail(id, request.error()));
    }

    private LaunchIntentView toView(LaunchIntent intent) throws JsonProcessingException {
        return new LaunchIntentView(
                intent.id(), intent.protocolVersion(), intent.type(),
                objectMapper.readTree(intent.payloadJson()), intent.state().name(),
                intent.lastError(), intent.createdAt(), intent.expiresAt());
    }

    private void validatePayload(String type, JsonNode payload) {
        if (!payload.isObject()) {
            throw badRequest("LaunchIntent payload 必须是对象");
        }
        if ("CHAT_OPEN_DRAFT".equals(type)) {
            requireText(payload, "cwd", true);
            requireText(payload, "seed", false);
            return;
        }
        if ("CHAT_OPEN_AND_SEND".equals(type)) {
            requireText(payload, "cwd", true);
            requireText(payload, "seed", false);
            String engine = requireText(payload, "engine", false);
            if (!SUPPORTED_ENGINES.contains(engine)) {
                throw badRequest("不支持的启动引擎");
            }
            requireOptionalText(payload, "codexHome");
            requireOptionalText(payload, "prdSessionId");
            return;
        }
        if ("CHAT_OPEN_PANEL".equals(type)) {
            String panel = requireText(payload, "panel", false);
            if (!SUPPORTED_PANELS.contains(panel)) {
                throw badRequest("不支持的启动面板");
            }
        }
    }

    private String requireText(JsonNode payload, String field, boolean allowEmpty) {
        JsonNode value = payload.get(field);
        if (value == null || !value.isTextual() || (!allowEmpty && value.textValue().isBlank())) {
            throw badRequest("LaunchIntent payload 字段无效: " + field);
        }
        return value.textValue();
    }

    private void requireOptionalText(JsonNode payload, String field) {
        JsonNode value = payload.get(field);
        if (value != null && !value.isNull() && (!value.isTextual() || value.textValue().isBlank())) {
            throw badRequest("LaunchIntent payload 字段无效: " + field);
        }
    }

    private ResponseStatusException badRequest(String reason) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, reason);
    }

    public record CreateLaunchIntentRequest(
            int protocolVersion,
            @NotBlank String type,
            @NotNull JsonNode payload) {
    }

    public record FailLaunchIntentRequest(@NotBlank String error) {
    }

    public record LaunchIntentView(
            String id,
            int protocolVersion,
            String type,
            JsonNode payload,
            String state,
            String lastError,
            long createdAt,
            long expiresAt) {
    }
}
