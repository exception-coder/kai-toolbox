package com.exceptioncoder.toolbox.ops.domain;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/** 一次查询执行的历史记录。 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class QueryHistory {
    private String id;
    private String datasourceId;
    private String kind;     // SQL | REDIS | MQ
    private String content;
    private String status;   // OK | ERROR | RUNNING | UNKNOWN
    private Integer rowCount;
    private Long elapsedMs;
    private String errorMsg;
    /** 执行结果快照；授权写入保留结果以便按请求 ID 核对，普通查询仍沿用快照大小限制。 */
    private String resultJson;
    /** 是否存有可查看的结果快照；列表查询用 CASE 派生，无需拖回完整 resultJson。 */
    private boolean hasResult;
    private long executedAt;
}
