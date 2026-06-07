package com.exceptioncoder.toolbox.resume.api.dto;

/**
 * 基本信息字段级 patch。全部字段可选:仅覆盖请求中显式给出(非 null)的字段,
 * 未给出的保持原值;显式传空串才清空。避免整份覆盖误清联系方式等。
 */
public record BasicsPatchDto(
        String name,
        String gender,
        String age,
        String experienceYears,
        String jobIntent,
        String city,
        String email,
        String phone,
        String avatar,
        String advantage) {
}
