package com.exceptioncoder.toolbox.foreconsult.backend;

import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/** Application-scoped image metadata never projects bytes into task or metadata responses. */
@Repository
public class ConsultImageStore {
    private static final String COLUMNS = "attachment_id, upload_id, content_hash, media_type, byte_size, width, height, created_at, expires_at";
    private final JdbcTemplate jdbc;

    public ConsultImageStore(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public record Image(String attachmentId, String uploadId, String sha256, String mediaType, long size,
                        int width, int height, long createdAt, long expiresAt) {}

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

    /** Bounded aggregate, independent of historical task count. No BLOB is loaded. */
    public boolean hasCapacity(String client, long incoming, long now) {
        var totals = jdbc.queryForMap("SELECT COUNT(*) AS entries, COALESCE(SUM(CASE WHEN expires_at > ? AND image_bytes IS NOT NULL THEN byte_size ELSE 0 END), 0) AS bytes FROM consult_analysis_attachment", now);
        var own = jdbc.queryForMap("SELECT COUNT(*) AS entries, COALESCE(SUM(CASE WHEN expires_at > ? AND image_bytes IS NOT NULL THEN byte_size ELSE 0 END), 0) AS bytes FROM consult_analysis_attachment WHERE client_id = ?", now, client);
        return ((Number) totals.get("entries")).longValue() < 10000 && ((Number) own.get("entries")).longValue() < 2000
                && ((Number) totals.get("bytes")).longValue() + incoming <= 100L * 1024 * 1024
                && ((Number) own.get("bytes")).longValue() + incoming <= 25L * 1024 * 1024;
    }

    public void clean(long now) {
        jdbc.update("UPDATE consult_analysis_attachment SET image_bytes = NULL WHERE expires_at <= ? AND image_bytes IS NOT NULL", now);
        jdbc.update("DELETE FROM consult_analysis_attachment WHERE created_at <= ? AND image_bytes IS NULL", now - 30L * 86400000);
    }
}
