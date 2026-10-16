package com.exceptioncoder.toolbox.foreconsult.api;

import com.exceptioncoder.toolbox.common.attachment.SessionAttachmentReader;
import com.exceptioncoder.toolbox.common.auth.annotation.RequireAuth;
import com.exceptioncoder.toolbox.common.auth.annotation.RequireRole;
import com.exceptioncoder.toolbox.foreconsult.repository.ConsultSessionRepository;
import com.exceptioncoder.toolbox.foreconsult.service.ConsultAttachmentPolicyService;
import com.exceptioncoder.toolbox.foreconsult.service.ConsultResourceAccess;
import org.springframework.web.bind.annotation.*;
import java.io.IOException;

/** 人员配置和签名MCP读取分开鉴权；读取只接受当前咨询会话附件。 */
@RestController
@RequestMapping("/api/fore-consult/attachments")
public class ConsultAttachmentController {
    private final ConsultAttachmentPolicyService policy;
    private final ConsultResourceAccess access;
    private final ConsultSessionRepository sessions;
    private final SessionAttachmentReader reader;

    public ConsultAttachmentController(ConsultAttachmentPolicyService policy, ConsultResourceAccess access,
                                       ConsultSessionRepository sessions, SessionAttachmentReader reader) {
        this.policy = policy; this.access = access; this.sessions = sessions; this.reader = reader;
    }

    @GetMapping("/policy") @RequireAuth
    public ConsultAttachmentPolicyService.View policy() { return policy.get(); }

    @PutMapping("/policy") @RequireRole("ADMIN")
    public ConsultAttachmentPolicyService.View save(@RequestBody PolicyRequest request) {
        return policy.save(request.uploadMaxMb(), request.readMaxMb());
    }

    @PostMapping("/sessions/{runtimeId}/read")
    public SessionAttachmentReader.Content read(@PathVariable String runtimeId,
            @RequestBody SessionAttachmentReader.Request request,
            @RequestHeader(value = "X-Consult-Resource-Token", required = false) String token) throws IOException {
        access.require(runtimeId, token);
        if (sessions.findByDevSessionId(runtimeId).isEmpty()) throw new IllegalArgumentException("未关联咨询会话");
        return reader.readContent(runtimeId, policy.get().effectiveReadBytes(), request);
    }

    /** 全局附件大小策略。 */
    public record PolicyRequest(int uploadMaxMb, int readMaxMb) { }
}
