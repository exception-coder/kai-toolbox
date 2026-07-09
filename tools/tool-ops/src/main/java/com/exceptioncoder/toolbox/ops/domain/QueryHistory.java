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
    private String status;   // OK | ERROR
    private Integer rowCount;
    private Long elapsedMs;
    private String errorMsg;
    private long executedAt;
}
