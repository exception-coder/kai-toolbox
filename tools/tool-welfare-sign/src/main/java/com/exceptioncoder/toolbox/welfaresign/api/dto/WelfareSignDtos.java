package com.exceptioncoder.toolbox.welfaresign.api.dto;

import java.util.Map;

public final class WelfareSignDtos {
    private WelfareSignDtos() {}

    public record ConfigView(
            String loginMode,
            String redirectUrl,
            String loginImageUrl,
            String detailImageUrl,
            String detailTitle,
            String detailContent,
            boolean popupEnabled,
            String popupTitle,
            String popupContent,
            String signatureNotice,
            String extraFieldsJson,
            long updatedAt
    ) {}

    public record ConfigRequest(
            String loginMode,
            String redirectUrl,
            String loginImageUrl,
            String detailImageUrl,
            String detailTitle,
            String detailContent,
            boolean popupEnabled,
            String popupTitle,
            String popupContent,
            String signatureNotice,
            String extraFieldsJson
    ) {}

    public record EmployeeView(
            long id,
            String employeeNo,
            String name,
            String phone,
            String account,
            String department,
            String extraJson,
            boolean enabled,
            long createdAt,
            long updatedAt,
            boolean signed,
            Long signedAt
    ) {}

    public record EmployeeRequest(
            String employeeNo,
            String name,
            String phone,
            String account,
            String password,
            String department,
            String extraJson,
            boolean enabled
    ) {}

    public record LoginRequest(String loginId, String password, String smsCode) {}

    public record LoginResponse(EmployeeView employee, ConfigView config) {}

    public record SignRequest(long employeeId, String signatureData, Map<String, Object> extra) {}

    public record SignResponse(boolean ok, String redirectUrl) {}

    public record SignRecordView(
            long id,
            long employeeId,
            String employeeNo,
            String name,
            String phone,
            String department,
            String signatureData,
            String extraJson,
            long signedAt,
            String ip,
            String userAgent
    ) {}
}
