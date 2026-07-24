package com.exceptioncoder.toolbox.prdclarify.api.dto;

/**
 * 进度评估文档某个版本的摘要信息，供「评估记录」抽屉展示版本列表。
 *
 * <p>版本列表以磁盘上实际存在的备份文件（{id}-progress-v{n}.md）+ 当前文件（{id}-progress.md）
 * 为准，不依赖 {@code progress_history} JSON 记录——道理跟 {@link DevDocVersionSummary} 完全一致。</p>
 *
 * @param version       版本号
 * @param isCurrent     是否为当前显示的版本（对应 {id}-progress.md 本身）
 * @param extraContext  评估时用户补充的上下文；无对应 {@code progress_history} 记录时为 null
 * @param generatedAt   评估时间戳（毫秒）；无记录时为 null
 */
public record ProgressVersionSummary(
        int version,
        boolean isCurrent,
        String extraContext,
        Long generatedAt
) {}
