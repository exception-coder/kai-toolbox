package com.exceptioncoder.toolbox.treesize.repository;

import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.DependsOn;
import org.springframework.jdbc.core.BatchPreparedStatementSetter;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.util.AbstractMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.TimeUnit;

/**
 * One-shot schema migrations for tool-treesize that can't be expressed as
 * {@code CREATE TABLE/INDEX IF NOT EXISTS} — specifically, adding the {@code ext} column to
 * {@code treesize_node} on existing databases and backfilling it so the video-library query
 * can stop doing full-table LIKE-OR scans against the 19-element extension whitelist.
 *
 * <p>Backfill runs on a background virtual thread so a multi-second sweep on a million-row
 * database does not extend Spring Boot startup. Until it completes, {@code findVideos} simply
 * returns the already-migrated subset — no transient incorrectness, just transient
 * incompleteness, which evaporates the moment the user reloads the page after backfill ends.
 */
@Component
@DependsOn("schemaInitializer")
public class TreeSizeMigration {

    private static final Logger log = LoggerFactory.getLogger(TreeSizeMigration.class);
    private static final int BATCH = 10_000;

    private final JdbcTemplate jdbc;

    public TreeSizeMigration(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @PostConstruct
    public void kickOff() {
        Thread.ofVirtual().name("treesize-migration").start(this::run);
    }

    private void run() {
        try {
            ensureExtColumn();
            ensureVideoIndexes();
            backfillExt();
        } catch (Exception e) {
            log.error("treesize migration failed", e);
        }
    }

    private void ensureExtColumn() {
        Integer present = jdbc.queryForObject(
                "SELECT COUNT(*) FROM pragma_table_info('treesize_node') WHERE name = 'ext'",
                Integer.class);
        if (present == null || present == 0) {
            jdbc.execute("ALTER TABLE treesize_node ADD COLUMN ext TEXT");
            log.info("treesize migration: added column treesize_node.ext");
        }
    }

    private void ensureVideoIndexes() {
        // (is_dir, ext, name COLLATE NOCASE): the primary video-library query plan — filter by
        // is_dir + ext, then range-scan in name order without ever consulting the heap.
        jdbc.execute("CREATE INDEX IF NOT EXISTS idx_node_video_ext_name "
                + "ON treesize_node(is_dir, ext, name COLLATE NOCASE)");
        // (is_dir, ext, size): same filter, ordered by size for the "sort by size" mode.
        jdbc.execute("CREATE INDEX IF NOT EXISTS idx_node_video_ext_size "
                + "ON treesize_node(is_dir, ext, size)");
    }

    private void backfillExt() {
        Long remaining = jdbc.queryForObject(
                "SELECT COUNT(*) FROM treesize_node WHERE is_dir = 0 AND ext IS NULL",
                Long.class);
        if (remaining == null || remaining == 0) {
            log.info("treesize migration: ext column already backfilled, skipping");
            return;
        }
        log.info("treesize migration: backfilling ext for {} rows in batches of {}...",
                remaining, BATCH);
        long t0 = System.nanoTime();
        long processed = 0;
        while (true) {
            List<Map.Entry<Long, String>> rows = jdbc.query(
                    "SELECT id, name FROM treesize_node WHERE is_dir = 0 AND ext IS NULL LIMIT ?",
                    (rs, i) -> new AbstractMap.SimpleEntry<>(rs.getLong(1), rs.getString(2)),
                    BATCH);
            if (rows.isEmpty()) break;
            jdbc.batchUpdate("UPDATE treesize_node SET ext = ? WHERE id = ?",
                    new BatchPreparedStatementSetter() {
                        @Override
                        public void setValues(PreparedStatement ps, int i) throws SQLException {
                            ps.setString(1, extOf(rows.get(i).getValue()));
                            ps.setLong(2, rows.get(i).getKey());
                        }
                        @Override
                        public int getBatchSize() { return rows.size(); }
                    });
            processed += rows.size();
            if (rows.size() < BATCH) break;
        }
        long elapsedSec = TimeUnit.NANOSECONDS.toSeconds(System.nanoTime() - t0);
        log.info("treesize migration: ext backfill done — {} rows in {}s", processed, elapsedSec);
    }

    /** {@code "foo.MP4"} → {@code "mp4"}; {@code "Makefile"} or trailing dot → {@code ""}. */
    public static String extOf(String name) {
        if (name == null) return "";
        int dot = name.lastIndexOf('.');
        if (dot < 0 || dot == name.length() - 1) return "";
        return name.substring(dot + 1).toLowerCase(Locale.ROOT);
    }
}
