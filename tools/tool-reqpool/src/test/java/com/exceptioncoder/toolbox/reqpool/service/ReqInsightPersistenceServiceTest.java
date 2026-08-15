package com.exceptioncoder.toolbox.reqpool.service;

import com.exceptioncoder.toolbox.reqpool.domain.ReqInsight;
import com.exceptioncoder.toolbox.reqpool.domain.ReqInsightType;
import com.exceptioncoder.toolbox.reqpool.repository.ReqInsightRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.sqlite.SQLiteDataSource;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.EnableTransactionManagement;

import javax.sql.DataSource;
import java.sql.SQLException;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringJUnitConfig(ReqInsightPersistenceServiceTest.Config.class)
class ReqInsightPersistenceServiceTest {

    private final JdbcTemplate jdbc;
    private final ReqInsightPersistenceService service;

    @Autowired
    ReqInsightPersistenceServiceTest(JdbcTemplate jdbc, ReqInsightPersistenceService service) {
        this.jdbc = jdbc;
        this.service = service;
    }

    @BeforeEach
    void setUp() {
        jdbc.execute("DROP TABLE IF EXISTS req_pool_insight");
        jdbc.execute("DROP TABLE IF EXISTS req_pool_item");
        jdbc.execute("""
                CREATE TABLE req_pool_item (
                    id TEXT PRIMARY KEY, ai_insight TEXT, updated_at INTEGER NOT NULL
                )
                """);
        jdbc.execute("""
                CREATE TABLE req_pool_insight (
                    id TEXT PRIMARY KEY, item_id TEXT NOT NULL, analysis_type TEXT NOT NULL,
                    prompt_version TEXT NOT NULL, source_hash TEXT NOT NULL, portfolio_set_hash TEXT,
                    payload_json TEXT NOT NULL, engine TEXT NOT NULL, model TEXT,
                    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
                )
                """);
    }

    @Test
    void savesHistoryAndProjectionTogether() {
        jdbc.update("INSERT INTO req_pool_item (id, updated_at) VALUES ('req-1', 0)");

        service.saveAll(List.of(insight("history-1", "req-1", 10)));

        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM req_pool_insight", Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject(
                "SELECT ai_insight FROM req_pool_item WHERE id='req-1'", String.class))
                .isEqualTo("{\"priority\":\"HIGH\"}");
    }

    @Test
    void rollsBackAllPortfolioWritesWhenOneProjectionTargetIsMissing() {
        jdbc.update("INSERT INTO req_pool_item (id, updated_at) VALUES ('req-1', 0)");

        assertThatThrownBy(() -> service.saveAll(List.of(
                insight("history-1", "req-1", 10),
                insight("history-2", "missing", 10))))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("目标不存在");

        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM req_pool_insight", Integer.class)).isZero();
        assertThat(jdbc.queryForObject(
                "SELECT ai_insight FROM req_pool_item WHERE id='req-1'", String.class)).isNull();
    }

    private static ReqInsight insight(String id, String itemId, long createdAt) {
        return new ReqInsight(
                id, itemId, ReqInsightType.PORTFOLIO, "req-portfolio-v1", "source",
                "portfolio", "{\"priority\":\"HIGH\"}", "claude", null, createdAt);
    }

    @Configuration
    @EnableTransactionManagement
    static class Config {

        @Bean(destroyMethod = "destroy")
        DataSource dataSource() throws SQLException {
            SQLiteDataSource sqlite = new SQLiteDataSource();
            sqlite.setUrl("jdbc:sqlite::memory:");
            return new SingleConnectionDataSource(sqlite.getConnection(), true);
        }

        @Bean
        JdbcTemplate jdbcTemplate(DataSource dataSource) {
            return new JdbcTemplate(dataSource);
        }

        @Bean
        PlatformTransactionManager transactionManager(DataSource dataSource) {
            return new DataSourceTransactionManager(dataSource);
        }

        @Bean
        ReqInsightRepository reqInsightRepository(JdbcTemplate jdbc) {
            return new ReqInsightRepository(jdbc);
        }

        @Bean
        ReqInsightPersistenceService reqInsightPersistenceService(ReqInsightRepository repository) {
            return new ReqInsightPersistenceService(repository);
        }
    }
}
