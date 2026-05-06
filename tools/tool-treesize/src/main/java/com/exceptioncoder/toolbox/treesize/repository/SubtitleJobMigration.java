package com.exceptioncoder.toolbox.treesize.repository;

import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Incremental SQLite migrations for subtitle_job that cannot be expressed in the initial
 * CREATE TABLE (which uses IF NOT EXISTS and therefore never re-runs).
 *
 * <p>Each migration is wrapped in a try-catch: SQLite throws an error when a column already
 * exists, so the catch makes each migration idempotent — safe to run on every startup.
 */
@Component
public class SubtitleJobMigration {

    private static final Logger log = LoggerFactory.getLogger(SubtitleJobMigration.class);

    private final JdbcTemplate jdbc;

    public SubtitleJobMigration(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @PostConstruct
    void migrate() {
        addColumnIfMissing("translated_vtt_path", "TEXT");
    }

    private void addColumnIfMissing(String column, String type) {
        try {
            jdbc.execute("ALTER TABLE subtitle_job ADD COLUMN " + column + " " + type);
            log.info("subtitle_job: added column '{}'", column);
        } catch (Exception ignored) {
            // Column already exists — SQLite error on duplicate ADD COLUMN is expected.
        }
    }
}
