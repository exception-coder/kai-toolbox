package com.exceptioncoder.toolbox.prdclarify.repository;

import com.exceptioncoder.toolbox.llm.spi.DevelopmentChangeContextProvider.GitRepositoryChange;
import com.exceptioncoder.toolbox.prdclarify.domain.PrdDocChangeBaseline;
import com.exceptioncoder.toolbox.prdclarify.domain.PrdDocChangeCandidate;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/** 持久化候选分析快照，并在候选完成时推进稳定同步基线。 */
@Repository
public class PrdDocChangeBaselineRepository {

    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;

    public PrdDocChangeBaselineRepository(JdbcTemplate jdbc, ObjectMapper mapper) {
        this.jdbc = jdbc;
        this.mapper = mapper;
    }

    /** 读取 PRD 与开发会话的最近完成同步点。 */
    public Optional<PrdDocChangeBaseline> find(String prdSessionId, String devSessionId) {
        List<PrdDocChangeBaseline> rows = jdbc.query("""
                SELECT * FROM prd_doc_change_baseline
                WHERE prd_session_id = ? AND dev_session_id = ?
                """, (rs, rowNum) -> new PrdDocChangeBaseline(
                rs.getString("prd_session_id"),
                rs.getString("dev_session_id"),
                rs.getLong("conversation_seq"),
                readHeads(rs.getString("repository_heads_json")),
                rs.getString("workspace_snapshot_hash"),
                rs.getString("prd_hash"),
                rs.getString("tdd_hash"),
                rs.getLong("updated_at")), prdSessionId, devSessionId);
        return rows.stream().findFirst();
    }

    /** 保存候选分析时观察到的仓库位置，供成功后精确推进基线。 */
    public void saveCandidateSnapshot(String candidateId, List<GitRepositoryChange> repositories,
                                      String workspaceSnapshotHash) {
        Map<String, String> heads = new LinkedHashMap<>();
        for (GitRepositoryChange repository : repositories) {
            if (repository.repositoryKey() != null && repository.headCommit() != null) {
                heads.put(repository.repositoryKey(), repository.headCommit());
            }
        }
        jdbc.update("""
                INSERT INTO prd_doc_change_analysis_snapshot (
                    candidate_id, repository_heads_json, workspace_snapshot_hash, created_at
                ) VALUES (?, ?, ?, ?)
                ON CONFLICT(candidate_id) DO UPDATE SET
                    repository_heads_json = excluded.repository_heads_json,
                    workspace_snapshot_hash = excluded.workspace_snapshot_hash
                """, candidateId, writeHeads(heads), workspaceSnapshotHash, System.currentTimeMillis());
    }

    /** 将候选保存的代码位置连同更新后的文档哈希提升为完成基线。 */
    public boolean promote(PrdDocChangeCandidate candidate, String prdHash, String tddHash) {
        List<Map<String, Object>> rows = jdbc.queryForList("""
                SELECT repository_heads_json, workspace_snapshot_hash
                FROM prd_doc_change_analysis_snapshot
                WHERE candidate_id = ?
                """, candidate.getId());
        if (rows.isEmpty()) {
            return false;
        }
        Map<String, Object> snapshot = rows.getFirst();
        long now = System.currentTimeMillis();
        jdbc.update("""
                INSERT INTO prd_doc_change_baseline (
                    prd_session_id, dev_session_id, conversation_seq, repository_heads_json,
                    workspace_snapshot_hash, prd_hash, tdd_hash, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(prd_session_id, dev_session_id) DO UPDATE SET
                    conversation_seq = excluded.conversation_seq,
                    repository_heads_json = excluded.repository_heads_json,
                    workspace_snapshot_hash = excluded.workspace_snapshot_hash,
                    prd_hash = excluded.prd_hash,
                    tdd_hash = excluded.tdd_hash,
                    updated_at = excluded.updated_at
                """, candidate.getPrdSessionId(), candidate.getDevSessionId(),
                candidate.getConversationToSeq(), snapshot.get("repository_heads_json"),
                snapshot.get("workspace_snapshot_hash"), prdHash, tddHash, now);
        return true;
    }

    private Map<String, String> readHeads(String json) {
        try {
            return mapper.readValue(json == null ? "{}" : json,
                    new TypeReference<LinkedHashMap<String, String>>() {
                    });
        } catch (Exception e) {
            throw new IllegalStateException("仓库同步基线已损坏", e);
        }
    }

    private String writeHeads(Map<String, String> heads) {
        try {
            return mapper.writeValueAsString(heads);
        } catch (Exception e) {
            throw new IllegalStateException("序列化仓库基线失败", e);
        }
    }
}
