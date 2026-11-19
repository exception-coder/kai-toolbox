package com.exceptioncoder.toolbox.foreconsult.backend;

import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/** Application-scoped image metadata never projects bytes into task or metadata responses. */
@Repository
public class ConsultImageStore {
    private static final String COLUMNS = "attachment_id, upload_id, content_hash, media_type, byte_size, width, height, created_at, expires_at";
    private final JdbcTemplate jdbc;
    private final ConsultImagePolicy policy;

    public ConsultImageStore(JdbcTemplate jdbc) { this(jdbc, ConsultImagePolicy.defaults()); }

    @org.springframework.beans.factory.annotation.Autowired
    public ConsultImageStore(JdbcTemplate jdbc, ConsultImagePolicy policy) { this.jdbc = jdbc; this.policy = policy; }

    public ConsultImagePolicy policy() { return policy; }

    @com.fasterxml.jackson.annotation.JsonInclude(com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL)
    public record Image(String attachmentId, String uploadId, String sha256, String mediaType, long size,
                        int width, int height, Long createdAt, Long expiresAt) {}

    public Optional<Image> find(String client, String value, boolean byUpload) {
        String field = byUpload ? "upload_id" : "attachment_id";
        return jdbc.query("SELECT " + COLUMNS + " FROM consult_analysis_attachment WHERE client_id = ? AND " + field + " = ?",
                (r, n) -> new Image(r.getString("attachment_id"), r.getString("upload_id"), r.getString("content_hash"),
                        r.getString("media_type"), r.getLong("byte_size"), r.getInt("width"), r.getInt("height"),
                        r.getLong("created_at"), r.getLong("expires_at")), client, value).stream().findFirst();
    }

    public void insert(String client, Image image, byte[] bytes) {
        jdbc.update("INSERT INTO consult_analysis_attachment (attachment_id, client_id, upload_id, content_hash, media_type, byte_size, width, height, created_at, expires_at, image_bytes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                image.attachmentId(), client, image.uploadId(), image.sha256(), image.mediaType(), image.size(),
                image.width(), image.height(), image.createdAt(), image.expiresAt(), bytes);
    }

    public byte[] bytes(String client, String id, long now) {
        return jdbc.query("SELECT image_bytes FROM consult_analysis_attachment WHERE client_id = ? AND attachment_id = ? AND expires_at > ? AND image_bytes IS NOT NULL",
                (r, n) -> r.getBytes(1), client, id, now).stream().findFirst().orElse(null);
    }

    public record Usage(long activeCount, long activeBytes, long expiredCount, long expiredBytes,
                        long metadataCount, long totalCount, long uploaded24hCount, long uploaded24hBytes) {}

    /** Aggregates metadata inside SQLite; image bytes never enter the diagnostics response. */
    public Usage usage(String client, long now) {
        String sql = """
                SELECT COALESCE(SUM(CASE WHEN expires_at > ? AND image_bytes IS NOT NULL THEN 1 ELSE 0 END), 0) AS active_count,
                  COALESCE(SUM(CASE WHEN expires_at > ? AND image_bytes IS NOT NULL THEN byte_size ELSE 0 END), 0) AS active_bytes,
                  COALESCE(SUM(CASE WHEN expires_at <= ? THEN 1 ELSE 0 END), 0) AS expired_count,
                  COALESCE(SUM(CASE WHEN expires_at <= ? AND image_bytes IS NOT NULL THEN byte_size ELSE 0 END), 0) AS expired_bytes,
                  COALESCE(SUM(CASE WHEN image_bytes IS NULL THEN 1 ELSE 0 END), 0) AS metadata_count, COUNT(*) AS total_count,
                  COALESCE(SUM(CASE WHEN created_at > ? THEN 1 ELSE 0 END), 0) AS new_count,
                  COALESCE(SUM(CASE WHEN created_at > ? THEN byte_size ELSE 0 END), 0) AS new_bytes
                FROM consult_analysis_attachment
                """;
        Object[] params = client == null ? new Object[] {now, now, now, now, now - 86400000L, now - 86400000L}
                : new Object[] {now, now, now, now, now - 86400000L, now - 86400000L, client};
        if (client != null) { sql += " WHERE client_id = ?"; }
        return jdbc.queryForObject(sql, (r, n) -> new Usage(r.getLong("active_count"), r.getLong("active_bytes"),
                r.getLong("expired_count"), r.getLong("expired_bytes"), r.getLong("metadata_count"), r.getLong("total_count"),
                r.getLong("new_count"), r.getLong("new_bytes")), params);
    }

    public void requireCapacity(String client, long incoming, long now) {
        var own = usage(client, now);
        var totals = usage(null, now);
        limit("APP_BYTES", own.activeBytes(), incoming, policy.appBytes());
        limit("GLOBAL_BYTES", totals.activeBytes(), incoming, policy.globalBytes());
        limit("APP_COUNT", own.activeCount(), 1, policy.appCount());
        limit("GLOBAL_COUNT", totals.activeCount(), 1, policy.globalCount());
    }

    private void limit(String reason, long used, long incoming, long maximum) {
        if (incoming > maximum - used) {
            throw new ConsultBackendException(429, "IMAGE_QUOTA_EXCEEDED", "图片存储额度不足：" + reason
                    + "，请复用有效回执或联系管理员核对用量", true,
                    java.util.Map.of("reason", reason, "used", used, "limit", maximum, "incoming", incoming));
        }
    }

    public Optional<Image> reusable(String client, String hash, String mediaType, long validUntil) {
        return jdbc.query("SELECT " + COLUMNS + " FROM consult_analysis_attachment WHERE client_id = ? AND content_hash = ? "
                        + "AND media_type = ? AND expires_at > ? AND image_bytes IS NOT NULL ORDER BY expires_at DESC, attachment_id LIMIT 1",
                (r, n) -> new Image(r.getString("attachment_id"), r.getString("upload_id"), r.getString("content_hash"),
                        r.getString("media_type"), r.getLong("byte_size"), r.getInt("width"), r.getInt("height"),
                        r.getLong("created_at"), r.getLong("expires_at")), client, hash, mediaType, validUntil).stream().findFirst();
    }

    /** The same datasource transaction covers the image lease and task insertion. */
    public void admit(String client, java.util.List<Image> images, long now, Runnable insertTask) {
        var tx = new org.springframework.transaction.support.TransactionTemplate(
                new org.springframework.jdbc.datasource.DataSourceTransactionManager(java.util.Objects.requireNonNull(jdbc.getDataSource())));
        tx.executeWithoutResult(status -> {
            long until = now + policy.taskRetentionHours() * 3600000L;
            for (var image : images) {
                if (image.createdAt() + policy.maxLifetimeDays() * 86400000L < until) {
                    throw new ConsultBackendException(410, "ATTACHMENT_RETENTION_LIMIT", "图片剩余保留时间不足，请重新上传并使用新 uploadId/requestId", false);
                }
                int changed = jdbc.update("UPDATE consult_analysis_attachment SET expires_at = MAX(expires_at, ?) "
                        + "WHERE client_id = ? AND attachment_id = ? AND expires_at > ? AND image_bytes IS NOT NULL",
                        until, client, image.attachmentId(), now);
                if (changed != 1) { throw new ConsultBackendException(410, "ATTACHMENT_EXPIRED", "原图已过期，请重新上传", false); }
            }
            insertTask.run();
        });
    }

    public record Duplicates(long extraCount, long extraBytes) {}

    public Duplicates duplicates(String client, long now) {
        String filter = client == null ? "" : " AND client_id = ?";
        return jdbc.queryForObject("SELECT COALESCE(SUM(c - 1), 0) AS extra_count, COALESCE(SUM(b - one_size), 0) AS extra_bytes FROM "
                        + "(SELECT COUNT(*) AS c, SUM(byte_size) AS b, MAX(byte_size) AS one_size FROM consult_analysis_attachment "
                        + "WHERE expires_at > ? AND image_bytes IS NOT NULL" + filter
                        + " GROUP BY client_id, content_hash, media_type HAVING COUNT(*) > 1)",
                (r, n) -> new Duplicates(r.getLong("extra_count"), r.getLong("extra_bytes")),
                client == null ? new Object[] {now} : new Object[] {now, client});
    }

    public record Cleaned(int released, int removed) {}

    public record Storage(long databaseAllocatedBytes, long databaseReusableBytes, Long attachmentTableBytes,
                          Long databaseFileBytes, Long walBytes, Long diskUsableBytes, String status) {}

    /** Read-only SQLite and filesystem measurements. No VACUUM, checkpoint, paths or image bytes are returned. */
    public Storage storage() {
        long pageSize = jdbc.queryForObject("PRAGMA page_size", Long.class);
        long pages = jdbc.queryForObject("PRAGMA page_count", Long.class);
        long free = jdbc.queryForObject("PRAGMA freelist_count", Long.class);
        Long tableBytes = null;
        try {
            tableBytes = jdbc.queryForObject("SELECT COALESCE(SUM(pgsize), 0) FROM dbstat WHERE name = 'consult_analysis_attachment'", Long.class);
        } catch (org.springframework.dao.DataAccessException unavailable) {
            // Some SQLite builds omit dbstat. Logical usage remains available and the missing metric is explicit.
        }
        var files = jdbc.query("PRAGMA database_list", (r, n) -> "main".equals(r.getString("name")) ? r.getString("file") : "");
        String file = files.stream().filter(value -> value != null && !value.isBlank()).findFirst().orElse(null);
        if (file == null) { return new Storage(pages * pageSize, free * pageSize, tableBytes, null, null, null, "MEMORY_DATABASE"); }
        try {
            var path = java.nio.file.Path.of(file);
            var wal = java.nio.file.Path.of(file + "-wal");
            return new Storage(pages * pageSize, free * pageSize, tableBytes, java.nio.file.Files.size(path),
                    java.nio.file.Files.exists(wal) ? java.nio.file.Files.size(wal) : 0L,
                    java.nio.file.Files.getFileStore(path).getUsableSpace(), tableBytes == null ? "TABLE_SIZE_UNAVAILABLE" : "OK");
        } catch (java.io.IOException unavailable) {
            return new Storage(pages * pageSize, free * pageSize, tableBytes, null, null, null, "FILESYSTEM_UNAVAILABLE");
        }
    }

    public Cleaned clean(long now) {
        int released = jdbc.update("UPDATE consult_analysis_attachment SET image_bytes = NULL WHERE expires_at <= ? AND image_bytes IS NOT NULL", now);
        int removed = jdbc.update("DELETE FROM consult_analysis_attachment WHERE created_at <= ? AND image_bytes IS NULL", now - 30L * 86400000);
        removed += jdbc.update("DELETE FROM consult_analysis_attachment WHERE attachment_id IN (SELECT attachment_id FROM "
                + "(SELECT attachment_id, ROW_NUMBER() OVER (PARTITION BY client_id ORDER BY created_at DESC, attachment_id) AS position "
                + "FROM consult_analysis_attachment WHERE image_bytes IS NULL) WHERE position > ?)", policy.appMetadataCount());
        removed += jdbc.update("DELETE FROM consult_analysis_attachment WHERE attachment_id IN "
                + "(SELECT attachment_id FROM consult_analysis_attachment WHERE image_bytes IS NULL "
                + "ORDER BY created_at DESC, attachment_id LIMIT -1 OFFSET ?)", policy.globalMetadataCount());
        return new Cleaned(released, removed);
    }
}
