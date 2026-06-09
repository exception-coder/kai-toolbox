package com.exceptioncoder.toolbox.browserrequest.api.dto;

import jakarta.validation.constraints.NotBlank;

/** engine 可选：playwright-java / undetected-node；留空 = 用全局默认 engine。 */
public record CreateSessionRequest(String name, @NotBlank String url, String engine) {}
