package com.exceptioncoder.toolbox.prdclarify.delivery;

import com.exceptioncoder.toolbox.prdclarify.domain.DeliveryClaimStatus;
import com.exceptioncoder.toolbox.prdclarify.domain.DeliveryEvidenceStatus;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class DeliveryEvidenceVerifierTest {

    private final DeliveryEvidenceVerifier verifier = new DeliveryEvidenceVerifier();

    @Test
    void verifiesProjectBoundEvidenceAndCalculatesDigest(@TempDir Path root) throws Exception {
        Files.createDirectories(root.resolve("src"));
        Files.writeString(root.resolve("src/App.java"), "first\nsecond\nthird\n");
        var proposed = ledger(DeliveryClaimStatus.COMPLETED,
                new ProgressClaimLedgerParser.ProposedEvidence("src/App.java", 2, 3, "save"));

        var verified = verifier.verify(proposed, root.toString()).claims().getFirst();

        assertThat(verified.status()).isEqualTo(DeliveryClaimStatus.COMPLETED);
        assertThat(verified.evidences()).singleElement().satisfies(evidence -> {
            assertThat(evidence.status()).isEqualTo(DeliveryEvidenceStatus.VERIFIED);
            assertThat(evidence.relativePath()).isEqualTo("src/App.java");
            assertThat(evidence.fileSha256()).hasSize(64);
        });
    }

    @Test
    void downgradesCompletedClaimWhenEvidenceEscapesProject(@TempDir Path root) {
        var proposed = ledger(DeliveryClaimStatus.COMPLETED,
                new ProgressClaimLedgerParser.ProposedEvidence("../outside.java", 1, 1, null));

        var verified = verifier.verify(proposed, root.toString()).claims().getFirst();

        assertThat(verified.status()).isEqualTo(DeliveryClaimStatus.PARTIAL);
        assertThat(verified.evidences()).singleElement()
                .extracting(DeliveryEvidenceVerifier.VerifiedEvidence::status)
                .isEqualTo(DeliveryEvidenceStatus.INVALID_PATH);
    }

    private ProgressClaimLedgerParser.ProposedLedger ledger(
            DeliveryClaimStatus status,
            ProgressClaimLedgerParser.ProposedEvidence evidence) {
        return new ProgressClaimLedgerParser.ProposedLedger(List.of(
                new ProgressClaimLedgerParser.ProposedClaim(
                        "C-1", "claim", status, false, List.of(evidence))));
    }
}
