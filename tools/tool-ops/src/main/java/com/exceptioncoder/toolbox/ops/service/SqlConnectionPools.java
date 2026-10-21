package com.exceptioncoder.toolbox.ops.service;

import com.alibaba.druid.pool.DruidDataSource;
import com.alibaba.druid.pool.GetConnectionTimeoutException;
import com.exceptioncoder.toolbox.ops.domain.DatasourceType;
import com.exceptioncoder.toolbox.ops.domain.OpsDatasource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.sql.Connection;
import java.sql.SQLException;
import java.sql.SQLInvalidAuthorizationSpecException;
import java.sql.SQLNonTransientConnectionException;
import java.sql.SQLTimeoutException;
import java.sql.SQLTransientConnectionException;
import java.util.ArrayDeque;
import java.util.Collections;
import java.util.IdentityHashMap;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.locks.ReentrantLock;
import java.util.function.Function;
import java.util.function.LongSupplier;

/** 每个资源单独串行建池、熔断及有界探测；不创建后台重试调度器。 */
final class SqlConnectionPools implements AutoCloseable {
    private static final Logger log = LoggerFactory.getLogger(SqlConnectionPools.class);
    private final ConcurrentHashMap<String, Entry> entries = new ConcurrentHashMap<>();
    private final Function<OpsDatasource, DruidDataSource> factory;
    private final LongSupplier nanoTime;
    private final int waitMillis;
    private volatile boolean closed;

    SqlConnectionPools() {
        this(SqlPoolFactory::create, System::nanoTime, SqlPoolFactory.MAX_WAIT_MS);
    }

    SqlConnectionPools(Function<OpsDatasource, DruidDataSource> factory, LongSupplier nanoTime, int waitMillis) {
        this.factory = factory;
        this.nanoTime = nanoTime;
        this.waitMillis = waitMillis;
    }

    Connection borrow(OpsDatasource datasource, boolean manualTest) throws SQLException {
        if (closed) {
            throw unavailable();
        }
        if (datasource.getType() != DatasourceType.ORACLE && datasource.getType() != DatasourceType.MYSQL) {
            throw new SQLNonTransientConnectionException("该资源不是 SQL 数据库", "08001");
        }
        Entry entry = entries.computeIfAbsent(datasource.getId(), ignored -> new Entry(datasource));
        long started = System.nanoTime();
        try {
            if (!entry.lock.tryLock(waitMillis, TimeUnit.MILLISECONDS)) {
                throw new SQLTimeoutException("等待该数据源连接超时，请稍后重试", "08001");
            }
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new SQLTransientConnectionException("等待数据库连接已取消", "08001");
        }
        try {
            if (closed || entry.retired) {
                throw unavailable();
            }
            if (!entry.settings.equals(Settings.from(datasource))) {
                throw new SQLNonTransientConnectionException("连接配置已更新，请刷新后重试", "08003");
            }
            if (entry.failed && (entry.authenticationFailure && !manualTest
                    || nanoTime.getAsLong() - entry.retryAt < 0)) {
                throw entry.failureMessage();
            }
            try {
                if (entry.pool == null) {
                    entry.pool = factory.apply(datasource);
                    entry.pool.init();
                }
                long remaining = Math.max(1, waitMillis - TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started));
                Connection connection = entry.pool.getConnection(remaining);
                entry.failed = false;
                entry.failures = 0;
                return connection;
            } catch (SQLException | RuntimeException failure) {
                // 正常占满的健康池只返回超时，不销毁正在使用的连接，更不另建一个池。
                if ((failure instanceof SQLTimeoutException || failure instanceof GetConnectionTimeoutException) && entry.pool != null
                        && entry.pool.getLastCreateError() == null && entry.pool.getActiveCount() >= entry.pool.getMaxActive()) {
                    throw (SQLException) failure;
                }
                Throwable cause = entry.pool != null && entry.pool.getLastCreateError() != null
                        ? entry.pool.getLastCreateError() : failure;
                entry.recordFailure(cause);
                entry.closePool();
                log.warn("[ops-pool] 暂停建连 id={} reason={} code={} cooldownSeconds={}", datasource.getId(),
                        entry.authenticationFailure ? "authentication" : "connection", entry.errorCode, entry.cooldownSeconds);
                throw entry.failureMessage();
            }
        } finally {
            entry.lock.unlock();
        }
    }

    /** 保存后的权威配置先进入同一锁，迟到的旧请求不能重新启用旧口令。 */
    void reconfigure(OpsDatasource datasource) {
        if (closed) {
            return;
        }
        Entry entry = entries.computeIfAbsent(datasource.getId(), ignored -> new Entry(datasource));
        entry.lock.lock();
        try {
            if (entry.retired || datasource.getUpdatedAt() < entry.revision) {
                return;
            }
            Settings next = Settings.from(datasource);
            if (!next.equals(entry.settings)) {
                entry.closePool();
                entry.settings = next;
                entry.failed = false;
                entry.failures = 0;
            }
            entry.revision = datasource.getUpdatedAt();
        } finally {
            entry.lock.unlock();
        }
    }

    /** 删除保留无凭据的墓碑，阻止已经取到旧配置的在途请求复活连接池。 */
    void invalidate(String id) {
        Entry entry = entries.computeIfAbsent(id, ignored -> new Entry(null));
        entry.lock.lock();
        try {
            entry.retired = true;
            entry.settings = null;
            entry.closePool();
        } finally {
            entry.lock.unlock();
        }
    }

    @Override
    public void close() {
        closed = true;
        entries.keySet().forEach(this::invalidate);
    }

    private static SQLNonTransientConnectionException unavailable() {
        return new SQLNonTransientConnectionException("数据源已删除或连接池已关闭，请刷新后重试", "08003");
    }

    private final class Entry {
        private final ReentrantLock lock = new ReentrantLock();
        private Settings settings;
        private long revision;
        private DruidDataSource pool;
        private boolean retired;
        private boolean failed;
        private boolean authenticationFailure;
        private int failures;
        private int errorCode;
        private long retryAt;
        private long cooldownSeconds;

        private Entry(OpsDatasource datasource) {
            if (datasource != null) {
                settings = Settings.from(datasource);
                revision = datasource.getUpdatedAt();
            }
        }

        private void recordFailure(Throwable cause) {
            SQLException authentication = authenticationError(cause);
            authenticationFailure = authentication != null;
            errorCode = authentication != null ? authentication.getErrorCode()
                    : cause instanceof SQLException sql ? sql.getErrorCode() : 0;
            failed = true;
            failures = Math.min(6, failures + 1);
            cooldownSeconds = authenticationFailure ? 30 : Math.min(300, 30L << Math.min(4, failures - 1));
            retryAt = nanoTime.getAsLong() + TimeUnit.SECONDS.toNanos(cooldownSeconds);
        }

        private SQLException failureMessage() {
            if (authenticationFailure) {
                return new SQLInvalidAuthorizationSpecException(
                        "数据库认证失败，已暂停自动重连；请修改连接账号或密码并保存，或冷却结束后手动测试连接", "28000", errorCode);
            }
            long seconds = Math.max(1, TimeUnit.NANOSECONDS.toSeconds(Math.max(0, retryAt - nanoTime.getAsLong())) + 1);
            return new SQLTransientConnectionException("数据库连接失败，已暂停重连；约 " + seconds + " 秒后可重试", "08001", errorCode);
        }

        private void closePool() {
            if (pool != null) {
                pool.close();
                pool = null;
            }
        }
    }

    private static SQLException authenticationError(Throwable failure) {
        var pending = new ArrayDeque<Throwable>();
        Set<Throwable> seen = Collections.newSetFromMap(new IdentityHashMap<>());
        pending.add(failure);
        while (!pending.isEmpty() && seen.size() < 32) {
            Throwable current = pending.removeFirst();
            if (!seen.add(current)) {
                continue;
            }
            if (current instanceof SQLException sql) {
                String state = sql.getSQLState();
                int code = sql.getErrorCode();
                if (sql instanceof SQLInvalidAuthorizationSpecException || state != null && state.startsWith("28")
                        || code == 1017 || code == 1005 || code == 28000 || code == 28001
                        || code == 1045 || code == 1698 || code == 3118) {
                    return sql;
                }
                if (sql.getNextException() != null) {
                    pending.add(sql.getNextException());
                }
            }
            if (current.getCause() != null) {
                pending.add(current.getCause());
            }
        }
        return null;
    }

    private record Settings(DatasourceType type, String host, int port, String database,
                            String username, String password, String params) {
        static Settings from(OpsDatasource datasource) {
            return new Settings(datasource.getType(), datasource.getHost(), datasource.getPort(), datasource.getDbName(),
                    datasource.getUsername(), datasource.getPassword(), datasource.getParams());
        }

        @Override
        public String toString() {
            return "SQL connection settings [redacted]";
        }
    }
}
