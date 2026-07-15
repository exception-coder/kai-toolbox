package com.exceptioncoder.toolbox.prdclarify.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 创建 PRD 澄清会话的请求体。
 *
 * @param title    需求标题（简短摘要）
 * @param rawInput 原始需求详细描述
 * @param project  关联项目名（可选，来自 GET /api/projects）
 * @param module   关联模块名（可选，来自工作区 modules API）
 * @param model    指定模型名称（可选，null 走 sidecar 默认模型）
 */
/**
 * @param role 提需求方角色：{@code PRODUCT}（产品经理/开发者，默认）|
 *             {@code BUSINESS}（业务人员，只问业务关键问题，跳过技术/设计细节）
 */
public record CreateSessionRequest(
        @NotBlank @Size(max = 200) String title,
        @NotBlank String rawInput,
        String project,
        String module,
        String model,
        String role
) {
}
