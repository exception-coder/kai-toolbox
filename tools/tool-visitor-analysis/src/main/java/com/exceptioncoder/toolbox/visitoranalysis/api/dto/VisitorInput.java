package com.exceptioncoder.toolbox.visitoranalysis.api.dto;

/**
 * 访客输入。当前业务库只有 name/phone/company/companyAddr；email/purpose 是"建议补充"字段，
 * 有则提升判别准确率，无则留空。
 */
public record VisitorInput(
        String name,
        String phone,
        String company,
        String companyAddr,
        String email,
        String purpose
) {
}
