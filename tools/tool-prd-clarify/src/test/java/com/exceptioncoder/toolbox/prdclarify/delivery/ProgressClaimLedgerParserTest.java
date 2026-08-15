package com.exceptioncoder.toolbox.prdclarify.delivery;

import com.exceptioncoder.toolbox.prdclarify.domain.DeliveryClaimStatus;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ProgressClaimLedgerParserTest {

    private final ProgressClaimLedgerParser parser = new ProgressClaimLedgerParser(new ObjectMapper());

    @Test
    void parsesBoundedStructuredClaims() {
        var ledger = parser.parse("""
                # 进度报告
                <!-- DELIVERY_CLAIMS_JSON
                {"claims":[{"claimId":"C-1","title":"保存需求","status":"COMPLETED","testItem":false,
                "evidence":[{"relativePath":"src/App.java","lineStart":3,"lineEnd":8,"symbol":"save"}]}]}
                DELIVERY_CLAIMS_JSON -->
                """);

        assertThat(ledger.claims()).singleElement().satisfies(claim -> {
            assertThat(claim.claimId()).isEqualTo("C-1");
            assertThat(claim.status()).isEqualTo(DeliveryClaimStatus.COMPLETED);
            assertThat(claim.evidences()).singleElement()
                    .extracting(ProgressClaimLedgerParser.ProposedEvidence::relativePath)
                    .isEqualTo("src/App.java");
        });
    }

    @Test
    void rejectsMissingOrDuplicateLedgerIdentity() {
        assertThatThrownBy(() -> parser.parse("# only markdown"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("claim ledger");
        assertThatThrownBy(() -> parser.parse("""
                <!-- DELIVERY_CLAIMS_JSON
                {"claims":[
                  {"claimId":"same","title":"A","status":"PARTIAL","evidence":[]},
                  {"claimId":"same","title":"B","status":"MISSING","evidence":[]}
                ]}
                DELIVERY_CLAIMS_JSON -->
                """))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("重复");
    }
}
