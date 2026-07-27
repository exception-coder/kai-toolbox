package com.exceptioncoder.toolbox.foreconsult.domain;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 版本化提示词：对应 consult_prompt 表的一行。
 * 只追加不原地改——改了旧版本就等于抹掉了历史行为的解释，退化归因会断线。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ConsultPrompt {

    private String id;
    private String promptKey;
    private int version;
    private String content;
    private String note;
    private boolean active;
    private long createdAt;
}
