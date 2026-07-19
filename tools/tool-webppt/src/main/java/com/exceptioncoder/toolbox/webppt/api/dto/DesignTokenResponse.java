package com.exceptioncoder.toolbox.webppt.api.dto;

import com.fasterxml.jackson.databind.JsonNode;
import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class DesignTokenResponse {
    private String version;
    private JsonNode theme;
}
