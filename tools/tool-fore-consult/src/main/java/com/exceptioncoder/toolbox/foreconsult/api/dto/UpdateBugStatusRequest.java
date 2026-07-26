package com.exceptioncoder.toolbox.foreconsult.api.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * 更新 BUG 状态（人工核实）。
 *
 * @param status NEW | CONFIRMED | DUPLICATE | FIXED | WONTFIX | REJECTED
 */
public record UpdateBugStatusRequest(
        @NotBlank String status
) {
}
