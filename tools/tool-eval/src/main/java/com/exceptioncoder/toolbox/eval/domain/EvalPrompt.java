package com.exceptioncoder.toolbox.eval.domain;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 版本化提示词。内容变更一律新增版本，不原地修改——否则历史 run 的口径无法复现。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class EvalPrompt {
    private String id;
    private String promptKey;
    private int version;
    private String content;
    private String note;
    private boolean active;
    private Long createdAt;
}
