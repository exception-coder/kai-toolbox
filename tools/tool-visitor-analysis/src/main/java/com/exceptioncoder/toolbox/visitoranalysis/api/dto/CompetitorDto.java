package com.exceptioncoder.toolbox.visitoranalysis.api.dto;

/** 竞品名单条目。新增时 rawName 必填，nameNorm 由服务端归一化生成。 */
public record CompetitorDto(
        Long id,
        String rawName,
        String nameNorm,
        String source,
        String note,
        Long createdAt
) {
}
