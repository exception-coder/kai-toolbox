package com.exceptioncoder.toolbox.prdclarify.repository;

import com.exceptioncoder.toolbox.prdclarify.domain.DeliveryClaim;
import com.exceptioncoder.toolbox.prdclarify.domain.DeliveryClaimEvidence;
import com.exceptioncoder.toolbox.prdclarify.domain.DeliveryClaimStatus;
import com.exceptioncoder.toolbox.prdclarify.domain.DeliveryEvidenceStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Delivery claim 与证据快照的数据访问层。 */
@Repository
public class DeliveryClaimRepository {

    private final JdbcTemplate jdbc;

    public DeliveryClaimRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** 插入一条不可变 claim。 */
    public void insertClaim(DeliveryClaim claim) {
        jdbc.update("""
                INSERT INTO delivery_claim (
                    id, session_id, artifact_id, claim_id, title, claim_status,
                    test_item, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, claim.id(), claim.sessionId(), claim.artifactId(), claim.claimId(), claim.title(),
                claim.status().name(), claim.testItem() ? 1 : 0, claim.createdAt(), claim.createdAt());
    }

    /** 插入一条不可变证据核验快照。 */
    public void insertEvidence(DeliveryClaimEvidence evidence) {
        jdbc.update("""
                INSERT INTO delivery_claim_evidence (
                    id, claim_row_id, relative_path, line_start, line_end, symbol,
                    file_sha256, validation_status, last_error, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, evidence.id(), evidence.claimId(), evidence.relativePath(), evidence.lineStart(),
                evidence.lineEnd(), evidence.symbol(), evidence.fileSha256(), evidence.status().name(),
                evidence.lastError(), evidence.createdAt(), evidence.createdAt());
    }

    /** 返回某版进度产物绑定的全部 claim 与证据。 */
    public List<DeliveryClaim> findByArtifact(String artifactId) {
        List<ClaimRow> claims = jdbc.query("""
                SELECT id, session_id, artifact_id, claim_id, title, claim_status, test_item, created_at
                FROM delivery_claim
                WHERE artifact_id = ?
                ORDER BY created_at ASC, claim_id ASC
                """, (resultSet, rowNumber) -> new ClaimRow(
                resultSet.getString("id"),
                resultSet.getString("session_id"),
                resultSet.getString("artifact_id"),
                resultSet.getString("claim_id"),
                resultSet.getString("title"),
                DeliveryClaimStatus.valueOf(resultSet.getString("claim_status")),
                resultSet.getInt("test_item") != 0,
                resultSet.getLong("created_at")), artifactId);
        if (claims.isEmpty()) {
            return List.of();
        }

        Map<String, List<DeliveryClaimEvidence>> evidenceByClaim = new LinkedHashMap<>();
        for (ClaimRow claim : claims) {
            evidenceByClaim.put(claim.id(), new ArrayList<>());
        }
        String placeholders = String.join(",", claims.stream().map(item -> "?").toList());
        Object[] ids = claims.stream().map(ClaimRow::id).toArray();
        jdbc.query("""
                SELECT id, claim_row_id, relative_path, line_start, line_end, symbol,
                       file_sha256, validation_status, last_error, created_at
                FROM delivery_claim_evidence
                WHERE claim_row_id IN (%s)
                ORDER BY created_at ASC, id ASC
                """.formatted(placeholders), resultSet -> {
            DeliveryClaimEvidence evidence = new DeliveryClaimEvidence(
                    resultSet.getString("id"),
                    resultSet.getString("claim_row_id"),
                    resultSet.getString("relative_path"),
                    resultSet.getInt("line_start"),
                    resultSet.getInt("line_end"),
                    resultSet.getString("symbol"),
                    resultSet.getString("file_sha256"),
                    DeliveryEvidenceStatus.valueOf(resultSet.getString("validation_status")),
                    resultSet.getString("last_error"),
                    resultSet.getLong("created_at"));
            List<DeliveryClaimEvidence> ownerEvidences = evidenceByClaim.get(evidence.claimId());
            if (ownerEvidences == null) {
                throw new IllegalStateException("证据指向不存在的 Delivery claim: " + evidence.claimId());
            }
            ownerEvidences.add(evidence);
        }, ids);

        return claims.stream().map(claim -> new DeliveryClaim(
                claim.id(), claim.sessionId(), claim.artifactId(), claim.claimId(), claim.title(),
                claim.status(), claim.testItem(), List.copyOf(evidenceByClaim.get(claim.id())), claim.createdAt()
        )).toList();
    }

    private record ClaimRow(
            String id,
            String sessionId,
            String artifactId,
            String claimId,
            String title,
            DeliveryClaimStatus status,
            boolean testItem,
            long createdAt) {
    }
}
