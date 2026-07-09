package com.exceptioncoder.toolbox.ops.domain;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/** 某系统在某环境下的一个中间件实例。 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class OpsDatasource {
    private String id;
    private String systemId;
    private String env;
    private DatasourceType type;
    private String name;
    private String host;
    private int port;
    private String username;
    private String password;
    /** MySQL 库名 / Oracle service_name / Redis db 索引 / MQ vhost */
    private String dbName;
    /** JDBC 追加到 URL 的额外 query 串 */
    private String params;
    private String note;
    private int sortOrder;
    private long createdAt;
    private long updatedAt;

    /** UI 单行展示：host:port[/db] */
    public String endpoint() {
        String base = host + ":" + port;
        return (dbName == null || dbName.isBlank()) ? base : base + "/" + dbName;
    }
}
