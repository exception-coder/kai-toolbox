package com.exceptioncoder.toolbox.resume.api.dto;

import java.util.List;

/**
 * 项目经历 upsert 入参。{@code id} 为幂等键(缺省由后端生成 {@code p-xxxx});
 * {@code position} 仅新增时生效(front/back),更新时忽略。未给出的字段在更新时保持原值。
 */
public record ProjectDto(
        String id,
        String name,
        String role,
        String period,
        String description,
        List<String> responsibilities,
        List<String> achievements,
        String position) {
}
