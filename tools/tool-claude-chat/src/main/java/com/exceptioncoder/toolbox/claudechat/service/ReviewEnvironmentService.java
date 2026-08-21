package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import org.springframework.stereotype.Service;

import java.util.List;

/** 公开评审页的业务安全环境检测，不执行模型调用或写入操作。 */
@Service
public class ReviewEnvironmentService {

    private final ClaudeChatSessionRepository sessions;
    private final AttachmentStorageService attachments;

    public ReviewEnvironmentService(ClaudeChatSessionRepository sessions,
                                    AttachmentStorageService attachments) {
        this.sessions = sessions;
        this.attachments = attachments;
    }

    public Assessment assess(String reviewSessionId) {
        var session = sessions.findById(reviewSessionId).orElse(null);
        boolean sessionAvailable = session != null;
        boolean readonly = sessionAvailable
                && SessionExecutionPolicy.isReviewOnly(session.getExecutionPolicy());
        AttachmentStorageService.Capability attachmentCapability = attachments.capability(reviewSessionId);
        boolean imageInputAvailable = readonly && attachmentCapability.available();
        List<Check> checks = List.of(
                new Check("link", "评审链接", sessionAvailable ? "PASS" : "FAIL",
                        sessionAvailable ? "链接有效，评审会话可以访问" : "评审会话不存在，请联系链接创建者重新生成链接"),
                new Check("readonly", "只读保护", readonly ? "PASS" : "FAIL",
                        readonly ? "只用于需求评审，不会读取或修改项目代码" : "只读保护状态异常，请暂停评审并联系链接创建者"),
                new Check("attachments", "附件上传", attachmentCapability.available() ? "PASS" : "FAIL",
                        attachmentCapability.message()),
                new Check("imageInput", "图片识别", imageInputAvailable ? "PASS" : "FAIL",
                        imageInputAvailable
                                ? "截图会直接交给 AI，无需开放文件读取权限"
                                : "图片识别通道不可用，请先重新上传；仍失败时联系链接创建者")
        );
        boolean ready = checks.stream().allMatch(check -> "PASS".equals(check.status()));
        return new Assessment(ready ? "READY" : "DEGRADED", System.currentTimeMillis(), checks);
    }

    public record Assessment(String status, long checkedAt, List<Check> checks) {}

    public record Check(String key, String label, String status, String message) {}
}
