package com.exceptioncoder.toolbox.foreconsult.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.util.List;

/**
 * 启动业务系统咨询会话的请求体。
 *
 * @param systemName       所选系统名（来自 claude-chat workspaces）
 * @param systemSourcePath 所选系统源码路径（作为悬浮会话 cwd 的快照）
 * @param moduleNames      所选模块名列表（可选，服务层序列化为 JSON 存库）
 * @param questionTitle    用户填写并添加 UTC 日期前缀后的问题标题
 * @param question         用户原始问题；调度提示词由服务端生成，前端不能覆盖
 * @param userId           发起咨询的用户（可选）
 * @param role             回答对象角色：{@code IT}（IT 客服）| {@code BIZ}（业务员），null 时按 IT 兜底
 */
public record StartSessionRequest(
        @NotBlank String systemName,
        @NotBlank String systemSourcePath,
        List<String> moduleNames,
        @NotBlank @Size(max = 40) @Pattern(regexp = "\\d{6}-.+", message = "问题标题格式必须为 yyMMdd-标题")
        String questionTitle,
        @NotBlank @Size(max = 4000) String question,
        String userId,
        String role,
        @Pattern(regexp = "claude|codex") String engine,
        @Size(max = 100) String model,
        @Size(max = 20) String codexReasoningEffort,
        @Pattern(regexp = "default|fast") String codexSpeed,
        @Size(max = 500) String codexHome,
        @Pattern(regexp = "v1|v2|v3|v4") String orchestrationVersion
) {
}
