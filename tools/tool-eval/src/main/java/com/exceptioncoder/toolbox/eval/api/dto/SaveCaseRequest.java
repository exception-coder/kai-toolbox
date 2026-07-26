package com.exceptioncoder.toolbox.eval.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** 新建/更新黄金集用例。 */
public record SaveCaseRequest(
        @NotBlank @Size(max = 32) String scenario,
        @NotBlank @Size(max = 100) String dataset,
        @NotBlank @Size(max = 200) String title,
        @NotBlank String inputJson,
        @NotBlank String expectedJson,
        String assertJson,
        String tags,
        @Size(max = 200) String sourceRef,
        Boolean enabled
) {
}
