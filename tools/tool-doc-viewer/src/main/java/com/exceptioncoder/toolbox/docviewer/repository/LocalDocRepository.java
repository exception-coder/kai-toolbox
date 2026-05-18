package com.exceptioncoder.toolbox.docviewer.repository;

import com.exceptioncoder.toolbox.docviewer.repository.entity.LocalDocSource;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

// 本地目录源的持久化（树/文件不入库，所以这里只管 local_doc_source 一张表）
@Repository
public class LocalDocRepository {

    private final JdbcTemplate jdbc;

    public LocalDocRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    private static final RowMapper<LocalDocSource> ROW = (rs, i) -> LocalDocSource.builder()
            .id(rs.getString("id"))
            .alias(rs.getString("alias"))
            .rootPath(rs.getString("root_path"))
            .lastVisitedAt(rs.getLong("last_visited_at"))
            .createdAt(rs.getLong("created_at"))
            .build();

    public Optional<LocalDocSource> findById(String id) {
        return jdbc.query("SELECT * FROM local_doc_source WHERE id = ?", ROW, id)
                .stream().findFirst();
    }

    public Optional<LocalDocSource> findByRootPath(String rootPath) {
        return jdbc.query("SELECT * FROM local_doc_source WHERE root_path = ?", ROW, rootPath)
                .stream().findFirst();
    }

    public List<LocalDocSource> listAll() {
        return jdbc.query(
                "SELECT * FROM local_doc_source ORDER BY last_visited_at DESC, created_at DESC",
                ROW);
    }

    public void insert(LocalDocSource s) {
        try {
            jdbc.update("""
                    INSERT INTO local_doc_source
                      (id, alias, root_path, last_visited_at, created_at)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    s.getId(), s.getAlias(), s.getRootPath(), s.getLastVisitedAt(), s.getCreatedAt());
        } catch (DuplicateKeyException e) {
            throw e;
        }
    }

    public void updateLastVisited(String id, long ts) {
        jdbc.update("UPDATE local_doc_source SET last_visited_at = ? WHERE id = ?", ts, id);
    }

    public void delete(String id) {
        jdbc.update("DELETE FROM local_doc_source WHERE id = ?", id);
    }
}
