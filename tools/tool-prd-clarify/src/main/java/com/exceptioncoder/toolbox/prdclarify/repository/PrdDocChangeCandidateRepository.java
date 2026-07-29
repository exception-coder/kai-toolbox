package com.exceptioncoder.toolbox.prdclarify.repository;

import com.exceptioncoder.toolbox.prdclarify.domain.PrdDocChangeCandidate;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public class PrdDocChangeCandidateRepository {

    private static final RowMapper<PrdDocChangeCandidate> ROW = (rs, rowNum) ->
            PrdDocChangeCandidate.builder()
                    .id(rs.getString("id"))
                    .prdSessionId(rs.getString("prd_session_id"))
                    .devSessionId(rs.getString("dev_session_id"))
                    .conversationFromSeq(rs.getLong("conversation_from_seq"))
                    .conversationToSeq(rs.getLong("conversation_to_seq"))
                    .codeSnapshotHash(rs.getString("code_snapshot_hash"))
                    .decision(rs.getString("decision"))
                    .aiDecision(rs.getString("ai_decision"))
                    .summary(rs.getString("summary"))
                    .reasoning(rs.getString("reasoning"))
                    .evidenceJson(rs.getString("evidence_json"))
                    .prdPatchPlanJson(rs.getString("prd_patch_plan_json"))
                    .tddPatchPlanJson(rs.getString("tdd_patch_plan_json"))
                    .risksJson(rs.getString("risks_json"))
                    .clarificationQuestion(rs.getString("clarification_question"))
                    .clarificationHistoryJson(rs.getString("clarification_history_json"))
                    .confidence(rs.getInt("confidence"))
                    .status(rs.getString("status"))
                    .applyStage(rs.getString("apply_stage"))
                    .lastError(rs.getString("last_error"))
                    .prdAppliedAt(rs.getObject("prd_applied_at") == null ? null : rs.getLong("prd_applied_at"))
                    .tddAppliedAt(rs.getObject("tdd_applied_at") == null ? null : rs.getLong("tdd_applied_at"))
                    .createdAt(rs.getLong("created_at"))
                    .updatedAt(rs.getLong("updated_at"))
                    .build();

    private final JdbcTemplate jdbc;

    public PrdDocChangeCandidateRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public Optional<PrdDocChangeCandidate> findById(String id) {
        return one("SELECT * FROM prd_doc_change_candidate WHERE id = ?", id);
    }

    public Optional<PrdDocChangeCandidate> findLatest(String prdSessionId) {
        return one("""
                SELECT * FROM prd_doc_change_candidate
                WHERE prd_session_id = ?
                ORDER BY created_at DESC
                LIMIT 1
                """, prdSessionId);
    }

    public Optional<PrdDocChangeCandidate> findBySnapshot(String prdSessionId, String devSessionId, String hash) {
        return one("""
                SELECT * FROM prd_doc_change_candidate
                WHERE prd_session_id = ? AND dev_session_id = ? AND code_snapshot_hash = ?
                LIMIT 1
                """, prdSessionId, devSessionId, hash);
    }

    public void insert(PrdDocChangeCandidate candidate) {
        jdbc.update("""
                INSERT INTO prd_doc_change_candidate (
                  id, prd_session_id, dev_session_id, conversation_from_seq, conversation_to_seq,
                  code_snapshot_hash, decision, ai_decision, summary, reasoning, evidence_json,
                  prd_patch_plan_json, tdd_patch_plan_json, risks_json, clarification_question,
                  clarification_history_json, confidence, status, apply_stage, last_error,
                  prd_applied_at, tdd_applied_at, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                candidate.getId(), candidate.getPrdSessionId(), candidate.getDevSessionId(),
                candidate.getConversationFromSeq(), candidate.getConversationToSeq(),
                candidate.getCodeSnapshotHash(), candidate.getDecision(), candidate.getAiDecision(),
                candidate.getSummary(), candidate.getReasoning(), candidate.getEvidenceJson(),
                candidate.getPrdPatchPlanJson(), candidate.getTddPatchPlanJson(), candidate.getRisksJson(),
                candidate.getClarificationQuestion(), candidate.getClarificationHistoryJson(),
                candidate.getConfidence(), candidate.getStatus(), candidate.getApplyStage(),
                candidate.getLastError(), candidate.getPrdAppliedAt(), candidate.getTddAppliedAt(),
                candidate.getCreatedAt(), candidate.getUpdatedAt());
    }

    public void updateDecision(String id, String decision) {
        jdbc.update("""
                UPDATE prd_doc_change_candidate
                SET decision = ?, status = 'PENDING', updated_at = ?
                WHERE id = ?
                """, decision, System.currentTimeMillis(), id);
    }

    public void updateAnalysis(String id, long conversationToSeq, String snapshotHash,
                               String decision, String aiDecision, String summary, String reasoning,
                               String evidenceJson, String prdPlanJson, String tddPlanJson, String risksJson,
                               String clarificationQuestion, String clarificationHistoryJson, int confidence) {
        jdbc.update("""
                UPDATE prd_doc_change_candidate
                SET conversation_to_seq = ?, code_snapshot_hash = ?,
                    decision = ?, ai_decision = ?, summary = ?, reasoning = ?, evidence_json = ?,
                    prd_patch_plan_json = ?, tdd_patch_plan_json = ?, risks_json = ?,
                    clarification_question = ?, clarification_history_json = ?, confidence = ?,
                    status = 'PENDING', last_error = NULL, updated_at = ?
                WHERE id = ?
                """, conversationToSeq, snapshotHash, decision, aiDecision, summary, reasoning,
                evidenceJson, prdPlanJson, tddPlanJson,
                risksJson, clarificationQuestion, clarificationHistoryJson, confidence,
                System.currentTimeMillis(), id);
    }

    public void updateStage(String id, String status, String stage, String error, Long prdAppliedAt,
                            Long tddAppliedAt) {
        jdbc.update("""
                UPDATE prd_doc_change_candidate
                SET status = ?, apply_stage = ?, last_error = ?,
                    prd_applied_at = COALESCE(?, prd_applied_at),
                    tdd_applied_at = COALESCE(?, tdd_applied_at),
                    updated_at = ?
                WHERE id = ?
                """, status, stage, error, prdAppliedAt, tddAppliedAt, System.currentTimeMillis(), id);
    }

    private Optional<PrdDocChangeCandidate> one(String sql, Object... args) {
        List<PrdDocChangeCandidate> rows = jdbc.query(sql, ROW, args);
        return rows.isEmpty() ? Optional.empty() : Optional.of(rows.get(0));
    }
}
