package com.exceptioncoder.toolbox.webppt.api.dto;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class PromptContent {
    private String version;
    private String content;
}
