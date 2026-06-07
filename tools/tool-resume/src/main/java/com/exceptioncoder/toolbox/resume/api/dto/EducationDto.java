package com.exceptioncoder.toolbox.resume.api.dto;

/**
 * 教育经历 upsert 入参。{@code id} 为幂等键(缺省生成 {@code e-xxxx});
 * {@code position} 仅新增时生效(front/back,默认 back)。未给出字段在更新时保持原值。
 */
public record EducationDto(
        String id,
        String school,
        String degree,
        String major,
        String period,
        String position) {
}
