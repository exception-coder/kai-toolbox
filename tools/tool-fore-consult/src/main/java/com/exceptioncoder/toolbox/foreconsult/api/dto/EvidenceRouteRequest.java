package com.exceptioncoder.toolbox.foreconsult.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.util.List;

/** 新增或编辑跨系统证据归属的请求。 */
public record EvidenceRouteRequest(
        @NotBlank @Size(max = 120) String contextSystem,
        @Size(max = 240) String moduleName,
        @NotBlank @Size(max = 240) String businessObject,
        @Size(max = 20) List<@Size(max = 80) String> keywords,
        @NotBlank @Size(max = 120) String evidenceSystem,
        @Pattern(regexp = "ERP_STANDBY|RUNTIME_METADATA|NONE") String schemaSource,
        @Size(max = 1000) String description,
        @Size(max = 20) List<@Size(max = 300) String> evidenceRefs,
        @Pattern(regexp = "DRAFT|CONFIRMED|DISABLED") String status
) {
}
