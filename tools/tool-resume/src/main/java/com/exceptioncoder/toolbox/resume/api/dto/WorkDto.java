package com.exceptioncoder.toolbox.resume.api.dto;

import java.util.List;

/**
 * 工作经历 upsert 入参。{@code id} 为幂等键(缺省生成 {@code w-xxxx});
 * {@code position} 仅新增时生效(front/back)。未给出字段在更新时保持原值。
 */
public record WorkDto(
        String id,
        String company,
        String role,
        String period,
        List<String> responsibilities,
        List<String> achievements,
        String position) {
}
