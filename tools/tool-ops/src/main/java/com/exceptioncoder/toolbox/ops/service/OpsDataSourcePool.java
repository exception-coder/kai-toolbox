package com.exceptioncoder.toolbox.ops.service;

import com.exceptioncoder.toolbox.ops.domain.OpsDatasource;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import redis.clients.jedis.JedisPool;
import redis.clients.jedis.JedisPoolConfig;

import java.sql.Connection;
import java.sql.SQLException;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 按数据源 id 懒建连接池（Druid for SQL，JedisPool for Redis）。
 * SQL 建连失败暂停重连；连接字段变更后恢复，删除后拒绝旧配置。
 * minIdle=0 + 空闲回收：排查完连接自动归还、长时空闲自动关闭，不长占远程库资源。
 */
@Component
public class OpsDataSourcePool {

    private static final Logger log = LoggerFactory.getLogger(OpsDataSourcePool.class);

    private static final int MAX_ACTIVE   = 5;
    private static final int MAX_WAIT_MS  = 8_000;

    private final SqlConnectionPools sqlPools = new SqlConnectionPools();
    private final ConcurrentHashMap<String, JedisPool>       redisPools = new ConcurrentHashMap<>();

    /* ───────── SQL ───────── */

    /** 取（或懒建）该数据源的 Druid 池并借出一个连接，调用方负责 close() 归还。 */
    public Connection borrowSql(OpsDatasource ds) throws SQLException {
        return sqlPools.borrow(ds, false);
    }

    /** 用户显式测试连接；认证失败冷却后仅允许一次受控探测。 */
    public Connection borrowSqlForTest(OpsDatasource ds) throws SQLException {
        return sqlPools.borrow(ds, true);
    }

    /** 测试连通性：取一个连接后立即归还。 */
    public void validateSql(OpsDatasource ds) throws SQLException {
        try (Connection ignored = borrowSqlForTest(ds)) { /* getConnection 本身即验证 */ }
    }

    /* ───────── Redis ───────── */

    /** 取（或懒建）该数据源的 JedisPool 并借出一个 Jedis，调用方负责 close() 归还。 */
    public redis.clients.jedis.Jedis borrowRedis(OpsDatasource ds) {
        JedisPool pool = redisPools.get(ds.getId());
        if (pool == null) {
            JedisPool created = buildJedisPool(ds);
            JedisPool prev = redisPools.putIfAbsent(ds.getId(), created);
            if (prev != null) {
                created.close();
                pool = prev;
            } else {
                log.info("[ops-pool] 建立 JedisPool id={} {}:{}", ds.getId(), ds.getHost(), ds.getPort());
                pool = created;
            }
        }
        redis.clients.jedis.Jedis jedis = pool.getResource();
        int db = dbIndex(ds);
        if (db > 0) jedis.select(db);
        return jedis;
    }

    /* ───────── 失效 ───────── */

    /** 保存连接配置后立即替换权威快照；仅连接字段变化才重置 SQL 故障状态。 */
    public void reconfigure(OpsDatasource datasource) {
        sqlPools.reconfigure(datasource);
        invalidateRedis(datasource.getId());
    }

    /** 删除数据源时关闭池，拒绝仍持有旧配置的在途请求。 */
    public void invalidate(String datasourceId) {
        sqlPools.invalidate(datasourceId);
        invalidateRedis(datasourceId);
    }

    private void invalidateRedis(String datasourceId) {
        JedisPool redis = redisPools.remove(datasourceId);
        if (redis != null) {
            redis.close();
            log.info("[ops-pool] 关闭 JedisPool id={}", datasourceId);
        }
    }

    /** Spring 容器关闭时释放全部池。 */
    @PreDestroy
    public void closeAll() {
        sqlPools.close();
        redisPools.keySet().forEach(id -> {
            JedisPool p = redisPools.remove(id);
            if (p != null) p.close();
        });
    }

    /* ───────── 构建 ───────── */

    private static JedisPool buildJedisPool(OpsDatasource ds) {
        JedisPoolConfig cfg = new JedisPoolConfig();
        cfg.setMaxTotal(MAX_ACTIVE);
        cfg.setMinIdle(0);
        cfg.setMaxIdle(2);
        cfg.setTestOnBorrow(true);
        cfg.setTimeBetweenEvictionRuns(java.time.Duration.ofSeconds(60));
        cfg.setMinEvictableIdleTime(java.time.Duration.ofMinutes(5));
        String pwd  = ds.getPassword();
        String user = ds.getUsername();
        if (pwd != null && !pwd.isBlank()) {
            return (user != null && !user.isBlank())
                    ? new JedisPool(cfg, ds.getHost(), ds.getPort(), MAX_WAIT_MS, user, pwd)
                    : new JedisPool(cfg, ds.getHost(), ds.getPort(), MAX_WAIT_MS, pwd);
        }
        return new JedisPool(cfg, ds.getHost(), ds.getPort(), MAX_WAIT_MS);
    }

    private static int dbIndex(OpsDatasource ds) {
        String db = ds.getDbName();
        if (db == null || db.isBlank()) return 0;
        try { return Integer.parseInt(db.trim()); } catch (NumberFormatException e) { return 0; }
    }
}
