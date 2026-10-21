package com.exceptioncoder.toolbox.ops.service;

import com.alibaba.druid.mock.MockConnection;
import com.alibaba.druid.mock.MockDriver;
import com.alibaba.druid.pool.DruidDataSource;
import com.exceptioncoder.toolbox.ops.domain.DatasourceType;
import com.exceptioncoder.toolbox.ops.domain.OpsDatasource;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;

import java.sql.Connection;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;
import java.util.Properties;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

@Timeout(30)
class SqlConnectionPoolsTest {
    private final AtomicLong now = new AtomicLong();
    private final CountingDriver driver = new CountingDriver();
    private final List<DruidDataSource> created = new CopyOnWriteArrayList<>();

    @Test
    void concurrentBadCredentialsCreateOnlyOnePoolAndOnePhysicalAttempt() throws Exception {
        driver.password = "changed";
        var datasource = datasource("db", "original", 1);
        try (var pools = registry(2000); var workers = Executors.newVirtualThreadPerTaskExecutor()) {
            CountDownLatch start = new CountDownLatch(1);
            var requests = new ArrayList<java.util.concurrent.Future<?>>();
            for (int index = 0; index < 50; index++) {
                requests.add(workers.submit(() -> {
                    start.await();
                    assertThatThrownBy(() -> pools.borrow(datasource, false)).isInstanceOf(SQLException.class);
                    return null;
                }));
            }
            start.countDown();
            for (var request : requests) {
                request.get(10, TimeUnit.SECONDS);
            }
            assertThat(created).hasSize(1);
            assertThat(driver.attempts.get()).isEqualTo(1);
            assertThat(created.getFirst().isClosed()).isTrue();
            // 真实创建线程应退出；不仅检查 HTTP/借连接调用次数。
            Thread.sleep(1100);
            assertThat(driver.attempts.get()).isEqualTo(1);
        }
    }

    @Test
    void passwordRotationStopsExistingPoolAndOnlyNewConnectionSettingsRecoverIt() throws Exception {
        var original = datasource("db", "original", 1);
        try (var pools = registry(1000); Connection active = pools.borrow(original, false)) {
            driver.password = "changed";
            assertThatThrownBy(() -> pools.borrow(original, false)).hasMessageContaining("认证失败");
            assertThat(driver.attempts.get()).isEqualTo(2);
            now.addAndGet(TimeUnit.HOURS.toNanos(1));
            var renamed = datasource("db", "original", 2);
            renamed.setName("new label");
            pools.reconfigure(renamed);
            for (int index = 0; index < 100; index++) {
                assertThatThrownBy(() -> pools.borrow(renamed, false)).hasMessageContaining("暂停自动重连");
            }
            assertThat(driver.attempts.get()).isEqualTo(2);
            var updated = datasource("db", "changed", 3);
            pools.reconfigure(updated);
            assertThatThrownBy(() -> pools.borrow(original, false)).hasMessageContaining("配置已更新");
            try (Connection recovered = pools.borrow(updated, false)) {
                assertThat(recovered.isClosed()).isFalse();
            }
            pools.reconfigure(original);
            try (Connection reused = pools.borrow(updated, false)) {
                assertThat(reused.isClosed()).isFalse();
            }
            assertThat(driver.attempts.get()).isEqualTo(3);
            assertThat(created).hasSize(2);
        }
    }

    @Test
    void explicitTestIsRateLimitedAndCanRecoverAnExternallyUnlockedAccount() throws Exception {
        driver.failure = new SQLException("account locked", "72000", 28000);
        var datasource = datasource("db", "original", 1);
        try (var pools = registry(1000)) {
            assertThatThrownBy(() -> pools.borrow(datasource, false)).hasMessageContaining("认证失败");
            for (int index = 0; index < 30; index++) {
                assertThatThrownBy(() -> pools.borrow(datasource, true)).hasMessageContaining("认证失败");
            }
            assertThat(driver.attempts.get()).isEqualTo(1);
            now.addAndGet(TimeUnit.SECONDS.toNanos(30));
            assertThatThrownBy(() -> pools.borrow(datasource, true)).hasMessageContaining("认证失败");
            assertThat(driver.attempts.get()).isEqualTo(2);
            driver.failure = null;
            now.addAndGet(TimeUnit.SECONDS.toNanos(30));
            assertThatThrownBy(() -> pools.borrow(datasource, false)).hasMessageContaining("暂停自动重连");
            try (Connection recovered = pools.borrow(datasource, true)) {
                assertThat(recovered.isClosed()).isFalse();
            }
            assertThat(driver.attempts.get()).isEqualTo(3);
        }
    }

    @Test
    void transientFailureAllowsOneProbePerIncreasingCooldownAndDoesNotBlockOtherResources() throws Exception {
        driver.failure = new SQLException("listener unavailable", "08001", 12514);
        var datasource = datasource("failed", "original", 1);
        try (var pools = registry(1000)) {
            assertThatThrownBy(() -> pools.borrow(datasource, false)).hasMessageContaining("暂停重连");
            now.addAndGet(TimeUnit.SECONDS.toNanos(29));
            assertThatThrownBy(() -> pools.borrow(datasource, false)).isInstanceOf(SQLException.class);
            assertThat(driver.attempts.get()).isEqualTo(1);
            now.addAndGet(TimeUnit.SECONDS.toNanos(1));
            assertThatThrownBy(() -> pools.borrow(datasource, false)).hasMessageContaining("暂停重连");
            now.addAndGet(TimeUnit.SECONDS.toNanos(59));
            assertThatThrownBy(() -> pools.borrow(datasource, false)).isInstanceOf(SQLException.class);
            assertThat(driver.attempts.get()).isEqualTo(2);
            driver.failure = null;
            try (Connection other = pools.borrow(datasource("other", "original", 1), false)) {
                assertThat(other.isClosed()).isFalse();
            }
            now.addAndGet(TimeUnit.SECONDS.toNanos(1));
            try (Connection recovered = pools.borrow(datasource, false)) {
                assertThat(recovered.isClosed()).isFalse();
            }
            assertThat(driver.attempts.get()).isEqualTo(4);
        }
    }

    @Test
    void fullHealthyPoolTimesOutWithoutClosingOrReplacingIt() throws Exception {
        var datasource = datasource("db", "original", 1);
        List<Connection> active = new ArrayList<>();
        try (var pools = registry(100)) {
            try {
                for (int index = 0; index < 5; index++) {
                    active.add(pools.borrow(datasource, false));
                }
                assertThatThrownBy(() -> pools.borrow(datasource, false)).isInstanceOf(SQLException.class);
                assertThat(created).hasSize(1);
                assertThat(created.getFirst().isClosed()).isFalse();
                active.removeLast().close();
                try (Connection reused = pools.borrow(datasource, false)) {
                    assertThat(reused.isClosed()).isFalse();
                }
                assertThat(driver.attempts.get()).isEqualTo(5);
            } finally {
                for (Connection connection : active) {
                    connection.close();
                }
            }
        }
    }

    @Test
    void failedInitializationClosesUnregisteredPoolAndReturnsOnlySanitizedError() throws Exception {
        DruidDataSource pool = mock(DruidDataSource.class);
        SQLException authentication = new SQLException("credential-must-not-escape", "72000", 1017);
        SQLException wrapper = new SQLException("init failed");
        wrapper.setNextException(authentication);
        doThrow(wrapper).when(pool).init();
        AtomicInteger builds = new AtomicInteger();
        try (var pools = new SqlConnectionPools(datasource -> {
            builds.incrementAndGet();
            return pool;
        }, now::get, 1000)) {
            for (int index = 0; index < 20; index++) {
                assertThatThrownBy(() -> pools.borrow(datasource("db", "original", 1), false))
                        .hasMessageContaining("认证失败").hasMessageNotContaining("credential-must-not-escape").hasNoCause();
            }
            assertThat(builds.get()).isEqualTo(1);
            verify(pool).close();
        }
    }

    @Test
    void deletionAndShutdownCannotRecreatePoolsFromLateSnapshots() throws Exception {
        var datasource = datasource("db", "original", 1);
        var pools = registry(1000);
        try {
            try (Connection connection = pools.borrow(datasource, false)) {
                assertThat(connection.isClosed()).isFalse();
            }
            pools.invalidate("db");
            pools.reconfigure(datasource("db", "changed", 2));
            assertThatThrownBy(() -> pools.borrow(datasource, false)).hasMessageContaining("已删除");
            pools.invalidate("never-used");
            assertThatThrownBy(() -> pools.borrow(datasource("never-used", "original", 1), false)).isInstanceOf(SQLException.class);
            pools.close();
            assertThatThrownBy(() -> pools.borrow(datasource("new", "original", 1), false)).hasMessageContaining("已关闭");
            assertThat(created).hasSize(1);
        } finally {
            pools.close();
        }
    }

    private SqlConnectionPools registry(int waitMillis) {
        return new SqlConnectionPools(datasource -> {
            DruidDataSource pool = SqlPoolFactory.create(datasource);
            pool.setDriver(driver);
            pool.setValidConnectionChecker(new com.alibaba.druid.pool.ValidConnectionCheckerAdapter() {
                @Override
                public boolean isValidConnection(Connection connection, String query, int timeout) throws Exception {
                    return !connection.isClosed();
                }
            });
            created.add(pool);
            return pool;
        }, now::get, waitMillis);
    }

    private OpsDatasource datasource(String id, String password, long revision) {
        return OpsDatasource.builder().id(id).type(DatasourceType.ORACLE).host("never-connect.invalid").port(1521)
                .username("test").password(password).dbName("test").updatedAt(revision).build();
    }

    private static final class CountingDriver extends MockDriver {
        private final AtomicInteger attempts = new AtomicInteger();
        private volatile String password = "original";
        private volatile SQLException failure;

        @Override
        public int getMajorVersion() {
            return 21;
        }

        @Override
        public Connection connect(String url, Properties properties) throws SQLException {
            attempts.incrementAndGet();
            if (failure != null) {
                throw failure;
            }
            if (!password.equals(properties.getProperty("password"))) {
                throw new SQLException("invalid credential", "72000", 1017);
            }
            return new MockConnection(this, url, properties);
        }
    }
}
