package com.exceptioncoder.toolbox.reqpool.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * @param prdSessionId 若 PRD 已生成，可直接携带 prd_session_id，
 *                     Controller 会将状态设为 PRD_READY，无需再调 link-prd 接口。
 *                     用于「PRD澄清助手生成完成后自动注册到需求管理池」场景。
 */
public record CreateReqRequest(
        @NotBlank @Size(max = 200) String title,
        String description,
        String project,
        String module,
        /** HIGH | MEDIUM | LOW，默认 MEDIUM */
        String priority,
        String assignee,
        /** yyyy-MM-dd */
        String deadline,
        String tags,
        String prdSessionId
) {}
