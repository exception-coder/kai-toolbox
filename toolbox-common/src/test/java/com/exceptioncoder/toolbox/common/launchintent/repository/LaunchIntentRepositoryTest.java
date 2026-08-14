package com.exceptioncoder.toolbox.common.launchintent.repository;

import com.exceptioncoder.toolbox.common.launchintent.domain.LaunchIntent;
import com.exceptioncoder.toolbox.common.launchintent.domain.LaunchIntentState;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.sqlite.SQLiteDataSource;
import org.springframework.jdbc.core.JdbcTemplate;

import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;

class LaunchIntentRepositoryTest {

    @TempDir
    Path tempDirectory;

    private LaunchIntentRepository repository;

    @BeforeEach
    void setUp() {
        SQLiteDataSource dataSource = new SQLiteDataSource();
        dataSource.setUrl("jdbc:sqlite:" + tempDirectory.resolve("launch-intent.db"));
        JdbcTemplate jdbc = new JdbcTemplate(dataSource);
        jdbc.execute("""
                CREATE TABLE platform_launch_intent (
                    id TEXT PRIMARY KEY,
                    protocol_version INTEGER NOT NULL,
                    intent_type TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    state TEXT NOT NULL,
                    last_error TEXT,
                    created_at INTEGER NOT NULL,
                    expires_at INTEGER NOT NULL,
                    acknowledged_at INTEGER,
                    updated_at INTEGER NOT NULL
                )
                """);
        repository = new LaunchIntentRepository(jdbc);
    }

    @Test
    void shouldPersistNullableFieldsAndStateTransitions() {
        LaunchIntent pending = new LaunchIntent(
                "intent-1", 1, "CHAT_OPEN_DRAFT", "{\"cwd\":\"D:/repo\",\"seed\":\"需求\"}",
                LaunchIntentState.PENDING, null, 1_000L, 2_000L, null, 1_000L);

        repository.insert(pending);

        assertThat(repository.findById("intent-1")).contains(pending);

        repository.updateState("intent-1", LaunchIntentState.FAILED, "打开会话失败", null, 1_100L);
        LaunchIntent failed = repository.findById("intent-1").orElseThrow();
        assertThat(failed.state()).isEqualTo(LaunchIntentState.FAILED);
        assertThat(failed.lastError()).isEqualTo("打开会话失败");
        assertThat(failed.acknowledgedAt()).isNull();

        repository.updateState("intent-1", LaunchIntentState.ACKED, null, 1_200L, 1_200L);
        LaunchIntent acknowledged = repository.findById("intent-1").orElseThrow();
        assertThat(acknowledged.state()).isEqualTo(LaunchIntentState.ACKED);
        assertThat(acknowledged.lastError()).isNull();
        assertThat(acknowledged.acknowledgedAt()).isEqualTo(1_200L);
    }
}
