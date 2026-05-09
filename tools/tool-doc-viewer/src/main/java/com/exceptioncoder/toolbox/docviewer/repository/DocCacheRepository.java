package com.exceptioncoder.toolbox.docviewer.repository;

import com.exceptioncoder.toolbox.docviewer.repository.entity.DocFileCache;
import com.exceptioncoder.toolbox.docviewer.repository.entity.DocSource;
import com.exceptioncoder.toolbox.docviewer.repository.entity.DocTreeNode;
import org.springframework.jdbc.core.BatchPreparedStatementSetter;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.util.List;
import java.util.Optional;

@Repository
public class DocCacheRepository {

    private final JdbcTemplate jdbc;

    public DocCacheRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    private static final RowMapper<DocSource> SOURCE_ROW = (rs, i) -> DocSource.builder()
            .id(rs.getString("id"))
            .owner(rs.getString("owner"))
            .repo(rs.getString("repo"))
            .refName(rs.getString("ref_name"))
            .subPath(rs.getString("sub_path"))
            .refSha(rs.getString("ref_sha"))
            .alias(rs.getString("alias"))
            .pat(rs.getString("pat"))
            .treeETag(rs.getString("tree_etag"))
            .rateLimitUntil(rs.getObject("rate_limit_until") == null ? null : rs.getLong("rate_limit_until"))
            .lastRefreshedAt(rs.getLong("last_refreshed_at"))
            .createdAt(rs.getLong("created_at"))
            .build();

    private static final RowMapper<DocTreeNode> NODE_ROW = (rs, i) -> DocTreeNode.builder()
            .sourceId(rs.getString("source_id"))
            .path(rs.getString("path"))
            .name(rs.getString("name"))
            .kind(rs.getString("kind"))
            .sha(rs.getString("sha"))
            .size(rs.getObject("size") == null ? null : rs.getLong("size"))
            .parentPath(rs.getString("parent_path"))
            .depth(rs.getInt("depth"))
            .build();

    private static final RowMapper<DocFileCache> FILE_ROW = (rs, i) -> DocFileCache.builder()
            .sha(rs.getString("sha"))
            .kind(rs.getString("kind"))
            .size(rs.getLong("size"))
            .content(rs.getString("content"))
            .cachedAt(rs.getLong("cached_at"))
            .build();

    // --- doc_source ---

    public Optional<DocSource> findSourceById(String id) {
        return jdbc.query("SELECT * FROM doc_source WHERE id = ?", SOURCE_ROW, id)
                .stream().findFirst();
    }

    public Optional<DocSource> findSourceByCoord(String owner, String repo, String ref, String subPath) {
        return jdbc.query("""
                SELECT * FROM doc_source
                 WHERE owner = ? AND repo = ? AND ref_name = ? AND sub_path = ?
                """, SOURCE_ROW, owner, repo, ref, subPath)
                .stream().findFirst();
    }

    public List<DocSource> listAllSources() {
        return jdbc.query("SELECT * FROM doc_source ORDER BY created_at DESC", SOURCE_ROW);
    }

    public void insertSource(DocSource s) {
        jdbc.update("""
                INSERT INTO doc_source
                  (id, owner, repo, ref_name, sub_path, ref_sha, alias, pat,
                   tree_etag, rate_limit_until, last_refreshed_at, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                s.getId(), s.getOwner(), s.getRepo(), s.getRefName(), s.getSubPath(),
                s.getRefSha(), s.getAlias(), s.getPat(),
                s.getTreeETag(), s.getRateLimitUntil(), s.getLastRefreshedAt(), s.getCreatedAt());
    }

    public void updateSourceRefAndETag(String id, String refSha, String etag, long lastRefreshedAt) {
        jdbc.update("""
                UPDATE doc_source SET ref_sha = ?, tree_etag = ?, last_refreshed_at = ?
                 WHERE id = ?
                """, refSha, etag, lastRefreshedAt, id);
    }

    public void updateSourceLastRefreshed(String id, long lastRefreshedAt) {
        jdbc.update("UPDATE doc_source SET last_refreshed_at = ? WHERE id = ?", lastRefreshedAt, id);
    }

    public void updateSourceRateLimitUntil(String id, Long until) {
        jdbc.update("UPDATE doc_source SET rate_limit_until = ? WHERE id = ?", until, id);
    }

    public void deleteSource(String id) {
        jdbc.update("DELETE FROM doc_tree_cache WHERE source_id = ?", id);
        jdbc.update("DELETE FROM doc_source WHERE id = ?", id);
    }

    // --- doc_tree_cache ---

    @Transactional
    public void replaceTreeCache(String sourceId, List<DocTreeNode> nodes) {
        jdbc.update("DELETE FROM doc_tree_cache WHERE source_id = ?", sourceId);
        if (nodes.isEmpty()) return;
        jdbc.batchUpdate("""
                INSERT INTO doc_tree_cache
                  (source_id, path, name, kind, sha, size, parent_path, depth)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                new BatchPreparedStatementSetter() {
                    @Override
                    public void setValues(PreparedStatement ps, int i) throws SQLException {
                        DocTreeNode n = nodes.get(i);
                        ps.setString(1, n.getSourceId());
                        ps.setString(2, n.getPath());
                        ps.setString(3, n.getName());
                        ps.setString(4, n.getKind());
                        ps.setString(5, n.getSha());
                        if (n.getSize() == null) ps.setNull(6, java.sql.Types.INTEGER);
                        else ps.setLong(6, n.getSize());
                        ps.setString(7, n.getParentPath());
                        ps.setInt(8, n.getDepth());
                    }

                    @Override
                    public int getBatchSize() {
                        return nodes.size();
                    }
                });
    }

    public List<DocTreeNode> listTreeNodes(String sourceId) {
        return jdbc.query("""
                SELECT * FROM doc_tree_cache WHERE source_id = ? ORDER BY path
                """, NODE_ROW, sourceId);
    }

    public Optional<DocTreeNode> findTreeNode(String sourceId, String path) {
        return jdbc.query("SELECT * FROM doc_tree_cache WHERE source_id = ? AND path = ?",
                NODE_ROW, sourceId, path).stream().findFirst();
    }

    // --- doc_file_cache ---

    public Optional<DocFileCache> findFileBySha(String sha) {
        return jdbc.query("SELECT * FROM doc_file_cache WHERE sha = ?", FILE_ROW, sha)
                .stream().findFirst();
    }

    public void upsertFile(DocFileCache f) {
        jdbc.update("""
                INSERT INTO doc_file_cache (sha, kind, size, content, cached_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(sha) DO UPDATE SET
                  kind = excluded.kind,
                  size = excluded.size,
                  content = excluded.content,
                  cached_at = excluded.cached_at
                """,
                f.getSha(), f.getKind(), f.getSize(), f.getContent(), f.getCachedAt());
    }
}
