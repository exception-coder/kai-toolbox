package com.exceptioncoder.toolbox.reqpool.api.dto;

public record UpdateReqRequest(
        String title,
        String description,
        String project,
        String module,
        String priority,
        String status,
        String assignee,
        String deadline,
        String tags
) {}
