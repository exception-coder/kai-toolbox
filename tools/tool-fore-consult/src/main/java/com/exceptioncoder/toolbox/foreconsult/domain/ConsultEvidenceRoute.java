package com.exceptioncoder.toolbox.foreconsult.domain;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/** 业务咨询跨系统证据归属。链路分析候选只有经人工确认后才参与工具授权。 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ConsultEvidenceRoute {

    private String id;
    private String contextSystem;
    private String moduleName;
    private String businessObject;
    private String keywords;
    private String evidenceSystem;
    private String schemaSource;
    private String description;
    private String evidenceRefs;
    private String status;
    private String source;
    private long createdAt;
    private long updatedAt;
    private Long confirmedAt;
}
