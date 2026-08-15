package com.exceptioncoder.toolbox.prdclarify.delivery;

import com.exceptioncoder.toolbox.prdclarify.domain.DeliveryClaim;
import com.exceptioncoder.toolbox.prdclarify.domain.DeliveryClaimEvidence;
import com.exceptioncoder.toolbox.prdclarify.repository.DeliveryClaimRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

/** 结构化 Delivery claim 的准备、持久化与查询边界。 */
@Service
public class DeliveryClaimLedgerService {

    private final ProgressClaimLedgerParser parser;
    private final DeliveryEvidenceVerifier verifier;
    private final DeliveryClaimRepository repository;

    public DeliveryClaimLedgerService(
            ProgressClaimLedgerParser parser,
            DeliveryEvidenceVerifier verifier,
            DeliveryClaimRepository repository) {
        this.parser = parser;
        this.verifier = verifier;
        this.repository = repository;
    }

    /** 在文件写入前完成纯解析与文件证据校验。 */
    public DeliveryEvidenceVerifier.VerifiedLedger prepare(String markdown, String projectPath) {
        return verifier.verify(parser.parse(markdown), projectPath);
    }

    /** 将已验证 ledger 原子绑定到 READY 产物。 */
    @Transactional
    public void save(String sessionId, String artifactId, DeliveryEvidenceVerifier.VerifiedLedger ledger) {
        if (sessionId == null || sessionId.isBlank() || artifactId == null || artifactId.isBlank()) {
            throw new IllegalArgumentException("sessionId 和 artifactId 不能为空");
        }
        long now = System.currentTimeMillis();
        for (DeliveryEvidenceVerifier.VerifiedClaim verifiedClaim : ledger.claims()) {
            String claimRowId = UUID.randomUUID().toString();
            DeliveryClaim claim = new DeliveryClaim(
                    claimRowId,
                    sessionId,
                    artifactId,
                    verifiedClaim.claimId(),
                    verifiedClaim.title(),
                    verifiedClaim.status(),
                    verifiedClaim.testItem(),
                    List.of(),
                    now);
            repository.insertClaim(claim);
            for (DeliveryEvidenceVerifier.VerifiedEvidence verifiedEvidence : verifiedClaim.evidences()) {
                repository.insertEvidence(new DeliveryClaimEvidence(
                        UUID.randomUUID().toString(),
                        claimRowId,
                        verifiedEvidence.relativePath(),
                        verifiedEvidence.lineStart(),
                        verifiedEvidence.lineEnd(),
                        verifiedEvidence.symbol(),
                        verifiedEvidence.fileSha256(),
                        verifiedEvidence.status(),
                        verifiedEvidence.lastError(),
                        now));
            }
        }
    }

    /** 返回指定进度产物的不可变 claims。 */
    public List<DeliveryClaim> findByArtifact(String artifactId) {
        return artifactId == null || artifactId.isBlank() ? List.of() : repository.findByArtifact(artifactId);
    }
}
