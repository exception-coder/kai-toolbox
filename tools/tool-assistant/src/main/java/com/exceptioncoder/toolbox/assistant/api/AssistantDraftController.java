package com.exceptioncoder.toolbox.assistant.api;

import com.exceptioncoder.toolbox.assistant.domain.AssistantDraft;
import com.exceptioncoder.toolbox.assistant.domain.AssistantRegistration;
import com.exceptioncoder.toolbox.assistant.service.AssistantDraftService;
import com.exceptioncoder.toolbox.common.auth.annotation.RequireAuth;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** 嵌入式 Assistant 草稿与确认登记接口。 */
@RestController
@RequestMapping("/api/assistant/drafts")
@RequireAuth
public class AssistantDraftController {

    private final AssistantDraftService service;

    public AssistantDraftController(AssistantDraftService service) {
        this.service = service;
    }

    /** 创建尚未正式登记的草稿。 */
    @PostMapping
    public ResponseEntity<AssistantDraft> create(@Valid @RequestBody CreateDraftRequest request) {
        AssistantDraft draft = service.create(new AssistantDraftService.CreateDraftCommand(
                request.sessionId(), request.kind(), request.title(), request.description(),
                request.contextSnapshot(), request.evidence()));
        return ResponseEntity.status(HttpStatus.CREATED).body(draft);
    }

    /** 查询本人草稿。 */
    @GetMapping("/{id}")
    public AssistantDraft get(@PathVariable String id) {
        return service.get(id);
    }

    /** 用户确认后幂等登记到 ReqPool。 */
    @PostMapping("/{id}/confirm")
    public AssistantRegistration confirm(@PathVariable String id,
                                         @RequestHeader("Idempotency-Key") String idempotencyKey,
                                         @RequestBody(required = false) ConfirmDraftRequest request) {
        return service.confirm(id, idempotencyKey, request == null ? null : request.engineerUserId());
    }

    /** 创建草稿请求。 */
    public record CreateDraftRequest(@NotBlank @Size(max = 100) String sessionId,
                                     @NotBlank @Pattern(regexp = "BUG|SUGGESTION") String kind,
                                     @NotBlank @Size(max = 200) String title,
                                     @NotBlank @Size(max = 10_000) String description,
                                     Object contextSnapshot, Object evidence) {
    }

    /** 确认登记请求。 */
    public record ConfirmDraftRequest(Long engineerUserId) {
    }
}
