package com.exceptioncoder.toolbox.reqpool.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CreateReqRequest(
        @NotBlank @Size(max = 200) String title,
        String description,
        String project,
        String module,
        /** HIGH | MEDIUM | LOW，默认 MEDIUM */
        String priority,
        String assignee,
        /** yyyy-MM-dd */
        String deadline,
        String tags
) {}
