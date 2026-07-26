package com.exceptioncoder.toolbox.foreconsult.api.dto;

import jakarta.validation.constraints.NotBlank;

import java.util.List;

/**
 * 登记一条 BUG/数据问题（通常由前端解析 AI 回答里的结构化块后自动提交）。
 * 系统/模块/角色/用户/会话等上下文可由服务端按 consultSessionId 回填。
 *
 * @param consultSessionId 关联的咨询会话（用于回填上下文，可空）
 * @param turnIndex        第几轮
 * @param title            一句话标题（必填，去重键之一）
 * @param type             FUNCTION_BUG|DATA_ISSUE|CONFIG|PERMISSION|OTHER
 * @param severity         LOW|MEDIUM|HIGH|CRITICAL
 * @param module           所属模块（可空，空则用会话模块）
 * @param reproduce        复现步骤
 * @param expected         期望行为
 * @param actual           实际行为
 * @param suspectArea      疑似位置（菜单路径/接口/代码/表）
 * @param confidence       AI 置信度 0-100
 * @param question         用户提问原文
 * @param answer           AI 结论原文
 * @param evidence         证据（附件绝对路径等，可空）
 * @param refs             AI 依据的图谱/知识引用（可空）
 */
public record RegisterBugRequest(
        String consultSessionId,
        Integer turnIndex,
        @NotBlank String title,
        String type,
        String severity,
        String module,
        String reproduce,
        String expected,
        String actual,
        String suspectArea,
        Integer confidence,
        String question,
        String answer,
        List<String> evidence,
        List<String> refs
) {
}
