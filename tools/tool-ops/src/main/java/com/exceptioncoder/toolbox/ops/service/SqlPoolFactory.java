package com.exceptioncoder.toolbox.ops.service;

import com.alibaba.druid.pool.DruidDataSource;
import com.exceptioncoder.toolbox.ops.domain.DatasourceType;
import com.exceptioncoder.toolbox.ops.domain.OpsDatasource;

/** SQL 池的资源上界；重试与恢复由 SqlConnectionPools 统一控制。 */
final class SqlPoolFactory {
    static final int MAX_ACTIVE = 5;
    static final int MAX_WAIT_MS = 8_000;

    private SqlPoolFactory() { }

    static DruidDataSource create(OpsDatasource datasource) {
        DruidDataSource pool = new DruidDataSource();
        pool.setName("ops-" + datasource.getId());
        pool.setUrl(SqlConnector.buildUrl(datasource));
        pool.setDriverClassName(datasource.getType() == DatasourceType.ORACLE
                ? "oracle.jdbc.OracleDriver" : "com.mysql.cj.jdbc.Driver");
        pool.setUsername(datasource.getUsername());
        pool.setPassword(datasource.getPassword());
        // 初始化不访问远端，避免 init 失败后遗留未登记的创建线程。
        pool.setInitialSize(0);
        pool.setMinIdle(0);
        pool.setMaxActive(MAX_ACTIVE);
        pool.setMaxWait(MAX_WAIT_MS);
        pool.setConnectTimeout(MAX_WAIT_MS);
        pool.setSocketTimeout(60_000);
        pool.setTimeBetweenEvictionRunsMillis(60_000);
        pool.setMinEvictableIdleTimeMillis(300_000);
        pool.setValidationQuery(datasource.getType() == DatasourceType.ORACLE ? "SELECT 1 FROM DUAL" : "SELECT 1");
        pool.setTestWhileIdle(true);
        pool.setTestOnBorrow(false);
        pool.setTestOnReturn(false);
        pool.setPoolPreparedStatements(false);
        // retryAttempts 只控制每轮重试阈值，必须同时终止创建线程并唤醒等待者。
        pool.setConnectionErrorRetryAttempts(0);
        pool.setTimeBetweenConnectErrorMillis(30_000);
        pool.setBreakAfterAcquireFailure(true);
        pool.setFailFast(true);
        return pool;
    }
}
