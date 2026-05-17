package com.exceptioncoder.toolbox.browserrequest.api.dto;

import java.util.Map;

public record SaveRequestBody(String name, String curl, String method, String url,
                              Map<String, String> headers, String body) {}
