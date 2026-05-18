package com.exceptioncoder.toolbox.docviewer.api.dto;

import lombok.Data;

@Data
public class CreateLocalSourceRequest {
    private String rootPath;
    private String alias;
}
