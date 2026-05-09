package com.exceptioncoder.toolbox.docviewer.api.dto;

import lombok.Builder;
import lombok.Data;

import java.util.List;

@Data
@Builder
public class TreeResponseDTO {
    private String sourceId;
    private String ref;
    private String refSha;
    private boolean rateLimited;
    private List<TreeNodeDTO> nodes;
}
