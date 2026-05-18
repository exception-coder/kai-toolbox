package com.exceptioncoder.toolbox.docviewer.api.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class LocalTreeResponseDTO {
    private String sourceId;
    private String rootPath;
    // 复用 TreeNodeDTO 的结构（path/name/kind/sha/size/parentPath/depth）
    // 这里的 sha 字段填 "" 不参与一致性校验
    private List<TreeNodeDTO> nodes;
}
