package com.exceptioncoder.toolbox.downloader.api.dto;

import jakarta.validation.constraints.NotBlank;

public record CreateTaskRequest(
        @NotBlank(message = "url 必填") String url,
        String savePath,
        String filename,
        /** 可选；"JDK" / "OKHTTP"，留空走 JDK */
        String httpEngine
) {}
