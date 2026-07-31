package com.exceptioncoder.toolbox.prdclarify.api.dto;

import com.exceptioncoder.toolbox.prdclarify.domain.PrdBusinessFields;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 保存/更新 PRD 草稿的请求体：只含标题/需求描述/关联项目模块——草稿阶段还不需要决定
 * 角色/需求类型/澄清深度/澄清模式，那些在真正「开始澄清」（转正式）时才选。
 *
 * @param title    需求标题
 * @param rawInput 需求描述，允许暂时空着（先占个标题/项目/模块的位，之后再补描述）
 * @param project  关联项目名（可选）
 * @param module   关联模块名（可选）
 */
public record SaveDraftRequest(
        @NotBlank @Size(max = 200) String title,
        String rawInput,
        String project,
        String module,
        PrdBusinessFields businessFields
) {
}
