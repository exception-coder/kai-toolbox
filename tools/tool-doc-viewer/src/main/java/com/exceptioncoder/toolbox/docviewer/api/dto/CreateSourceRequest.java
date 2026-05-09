package com.exceptioncoder.toolbox.docviewer.api.dto;

import lombok.Data;

@Data
public class CreateSourceRequest {
    private String url;
    private String pat;
    private String alias;
}
