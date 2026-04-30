package com.exceptioncoder.toolbox.treesize.repository;

import com.exceptioncoder.toolbox.treesize.domain.FileNode;
import org.springframework.jdbc.core.BatchPreparedStatementSetter;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.util.List;

@Repository
public class NodeRepository {

    private final JdbcTemplate jdbc;

    public NodeRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    private static final RowMapper<FileNode> ROW = (rs, i) -> FileNode.builder()
            .scanId(rs.getString("scan_id"))
            .parentPath(rs.getString("parent_path"))
            .path(rs.getString("path"))
            .name(rs.getString("name"))
            .dir(rs.getInt("is_dir") == 1)
            .size(rs.getLong("size"))
            .fileCount(rs.getLong("file_count"))
            .dirCount(rs.getLong("dir_count"))
            .depth(rs.getInt("depth"))
            .build();

    public void batchInsert(List<FileNode> batch) {
        if (batch.isEmpty()) return;
        jdbc.batchUpdate("""
                INSERT INTO treesize_node
                  (scan_id, parent_path, path, name, is_dir, size, file_count, dir_count, depth)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, new BatchPreparedStatementSetter() {
            @Override
            public void setValues(PreparedStatement ps, int i) throws SQLException {
                FileNode n = batch.get(i);
                ps.setString(1, n.getScanId());
                ps.setString(2, n.getParentPath());
                ps.setString(3, n.getPath());
                ps.setString(4, n.getName());
                ps.setInt(5, n.isDir() ? 1 : 0);
                ps.setLong(6, n.getSize());
                ps.setLong(7, n.getFileCount());
                ps.setLong(8, n.getDirCount());
                ps.setInt(9, n.getDepth());
            }
            @Override
            public int getBatchSize() { return batch.size(); }
        });
    }

    /**
     * 查询指定父目录的直接子项，按 size desc 排序。
     * 当 parentPath 为 null 时查询顶层节点（root 自身）。
     */
    public List<FileNode> findChildren(String scanId, String parentPath) {
        if (parentPath == null) {
            return jdbc.query(
                    "SELECT * FROM treesize_node WHERE scan_id = ? AND parent_path IS NULL ORDER BY size DESC",
                    ROW, scanId);
        }
        return jdbc.query(
                "SELECT * FROM treesize_node WHERE scan_id = ? AND parent_path = ? ORDER BY size DESC",
                ROW, scanId, parentPath);
    }

    public List<FileNode> findRoot(String scanId) {
        return jdbc.query(
                "SELECT * FROM treesize_node WHERE scan_id = ? AND parent_path IS NULL ORDER BY size DESC",
                ROW, scanId);
    }
}
