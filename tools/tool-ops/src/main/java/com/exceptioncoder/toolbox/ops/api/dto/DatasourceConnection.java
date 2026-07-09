package com.exceptioncoder.toolbox.ops.api.dto;

import com.exceptioncoder.toolbox.ops.domain.OpsDatasource;

/**
 * 中间件实例的完整连接信息，<b>含密码明文</b>——仅供本机同进程/回环内部消费（如 ERP 需求开发把测试库「带入」只读连接）。
 *
 * <p>与 {@link DatasourceView}（对外脱敏）区别开：本记录只在 {@code /connection} 内部端点返回，
 * 单用户本地无鉴权模型下，本地进程本就能直接读 SQLite，故此处返回凭据不额外扩大攻击面。</p>
 */
public record DatasourceConnection(
        String id,
        String systemId,
        String env,
        String type,
        String name,
        String host,
        int port,
        String username,
        String password,
        String dbName,
        String params
) {
    public static DatasourceConnection from(OpsDatasource d) {
        return new DatasourceConnection(
                d.getId(), d.getSystemId(), d.getEnv(), d.getType().name(), d.getName(),
                d.getHost(), d.getPort(), d.getUsername(), d.getPassword(), d.getDbName(), d.getParams());
    }
}
