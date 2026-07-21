package com.exceptioncoder.toolbox.foreconsult.domain;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 系统链路关系边：对应 consult_topology_link 表的一行（持久化的拓扑分析结果）。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ConsultTopologyLink {

    private String fromSystem;
    private String toSystem;
    private String relation;
    private String description;
    private long createdAt;
}
