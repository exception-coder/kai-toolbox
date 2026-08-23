package com.exceptioncoder.toolbox.treesize.repository;

import com.exceptioncoder.toolbox.treesize.domain.VideoScanRoot;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

/** 视频库自主扫描根目录持久化。 */
@Repository
public class VideoScanRootRepository {
    private final JdbcTemplate jdbc;

    public VideoScanRootRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<VideoScanRoot> findAll() {
        return jdbc.query("SELECT id,path,enabled,last_scan_at,video_count,total_size,status,error_msg "
                        + "FROM video_scan_root ORDER BY path COLLATE NOCASE",
                (rs, row) -> new VideoScanRoot(rs.getString("id"), rs.getString("path"),
                        rs.getInt("enabled") == 1, (Long) rs.getObject("last_scan_at"),
                        rs.getLong("video_count"), rs.getLong("total_size"), rs.getString("status"),
                        rs.getString("error_msg")));
    }

    public Optional<VideoScanRoot> findById(String id) {
        return findAll().stream().filter(root -> root.id().equals(id)).findFirst();
    }

    public void insert(VideoScanRoot root, long now) {
        jdbc.update("INSERT INTO video_scan_root(id,path,enabled,status,create_time,update_time) VALUES(?,?,1,'IDLE',?,?)",
                root.id(), root.path(), now, now);
    }

    public void delete(String id) {
        jdbc.update("DELETE FROM video_scan_root WHERE id=?", id);
    }

    public void markRunning(String id, long now) {
        jdbc.update("UPDATE video_scan_root SET status='RUNNING',error_msg=NULL,update_time=? WHERE id=?", now, id);
    }

    public void markDone(String id, long count, long size, long now) {
        jdbc.update("UPDATE video_scan_root SET status='DONE',last_scan_at=?,video_count=?,total_size=?,update_time=? WHERE id=?",
                now, count, size, now, id);
    }

    public void markFailed(String id, String error, long now) {
        jdbc.update("UPDATE video_scan_root SET status='FAILED',error_msg=?,update_time=? WHERE id=?", error, now, id);
    }
}
