package com.exceptioncoder.toolbox.treesize.repository;

import com.exceptioncoder.toolbox.treesize.domain.VideoShare;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

/** {@code video_share} 表的全部读写。 */
@Repository
public class VideoShareRepository {

    private final JdbcTemplate jdbc;

    public VideoShareRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    private static final RowMapper<VideoShare> ROW = (rs, i) -> {
        long lastAccess = rs.getLong("last_access_at");
        // wasNull() 只对"最近一次读取的列"有效，必须紧挨着 getLong 取，
        // 放到构造参数末尾会变成在问 hit_count 是不是 NULL。
        boolean lastAccessNull = rs.wasNull();
        return new VideoShare(
                rs.getString("token"),
                rs.getString("scan_id"),
                rs.getString("path"),
                rs.getString("name"),
                rs.getLong("size"),
                rs.getLong("created_at"),
                rs.getLong("expires_at"),
                rs.getInt("revoked") == 1,
                rs.getLong("hit_count"),
                lastAccessNull ? null : lastAccess);
    };

    public void insert(VideoShare share) {
        jdbc.update("""
                INSERT INTO video_share(token, scan_id, path, name, size, created_at, expires_at, revoked, hit_count)
                VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0)
                """,
                share.token(), share.scanId(), share.path(), share.name(), share.size(),
                share.createdAt(), share.expiresAt());
    }

    public Optional<VideoShare> findByToken(String token) {
        return jdbc.query("SELECT * FROM video_share WHERE token = ?", ROW, token).stream().findFirst();
    }

    /** 管理列表：最近创建的在前。已过期的也返回 —— 用户需要看到"发出去的东西现在是什么状态"。 */
    public List<VideoShare> findAll(int limit) {
        return jdbc.query("SELECT * FROM video_share ORDER BY created_at DESC LIMIT ?", ROW, limit);
    }

    /** 同一视频当前仍有效的分享。用于避免每次点分享都新建一条。 */
    public Optional<VideoShare> findLiveByPath(String path, long now) {
        return jdbc.query("""
                SELECT * FROM video_share
                 WHERE path = ? AND revoked = 0 AND expires_at > ?
                 ORDER BY expires_at DESC LIMIT 1
                """, ROW, path, now).stream().findFirst();
    }

    public int revoke(String token) {
        return jdbc.update("UPDATE video_share SET revoked = 1 WHERE token = ?", token);
    }

    /** 播放命中计数。失败不影响播放，因此由调用方吞掉异常。 */
    public void touch(String token, long accessedAt) {
        jdbc.update("UPDATE video_share SET hit_count = hit_count + 1, last_access_at = ? WHERE token = ?",
                accessedAt, token);
    }

    /** 清理早已过期的记录，避免表无限增长。返回删除条数。 */
    public int deleteExpiredBefore(long cutoff) {
        return jdbc.update("DELETE FROM video_share WHERE expires_at < ?", cutoff);
    }
}
