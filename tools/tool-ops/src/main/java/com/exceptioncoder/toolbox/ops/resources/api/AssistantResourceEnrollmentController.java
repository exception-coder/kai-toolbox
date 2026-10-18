package com.exceptioncoder.toolbox.ops.resources.api;

import com.exceptioncoder.toolbox.common.auth.annotation.RequireRole;
import com.exceptioncoder.toolbox.ops.resources.application.AssistantResourceEnrollment;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** 与既有资源中心相同的管理员身份；安全登记不经过聊天。 */
@RestController
@RequireRole("ADMIN")
@RequestMapping("/api/ops/assistant-enrollment")
public class AssistantResourceEnrollmentController {
    private final AssistantResourceEnrollment enrollment;

    public AssistantResourceEnrollmentController(AssistantResourceEnrollment enrollment) {
        this.enrollment = enrollment;
    }

    /** 用户在专用预览确认后提交登记。 */
    @PostMapping
    public AssistantResourceEnrollment.Receipt enroll(@RequestBody AssistantResourceEnrollment.Command command) {
        return enrollment.enroll(command);
    }
}
