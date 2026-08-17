package com.regentech_fashion.supplierquote.infrastructure.erp;

import com.regentech_fashion.supplierquote.domain.BusinessAccountVerifier.VerifiedBusinessAccount;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcOperations;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class OracleBusinessAccountVerifierTest {
    private final JdbcOperations jdbc = mock(JdbcOperations.class);

    @Test
    void verifiesEnabledExternalSupplierAccount() {
        stubAccount(new OracleBusinessAccountVerifier.ScmAccount(
                101L, "supplier-demo", "68039f4545ad17dab03f90c5f6b5b3e0",
                1, 1, 202L, "测试供应商"));

        Optional<VerifiedBusinessAccount> result = verifier().verify("supplier-demo", "123456");

        assertThat(result).contains(new VerifiedBusinessAccount(
                "101", "supplier-demo", "supplier-demo", "202", "测试供应商", "SCM"));
    }

    @Test
    void rejectsInternalOrUnboundAccount() {
        stubAccount(new OracleBusinessAccountVerifier.ScmAccount(
                101L, "supplier-demo", "68039f4545ad17dab03f90c5f6b5b3e0",
                1, 0, null, null));

        assertThat(verifier().verify("supplier-demo", "123456")).isEmpty();
    }

    @SuppressWarnings("unchecked")
    private void stubAccount(OracleBusinessAccountVerifier.ScmAccount account) {
        when(jdbc.query(anyString(), any(org.springframework.jdbc.core.RowMapper.class), anyString()))
                .thenReturn(List.of(account));
    }

    private OracleBusinessAccountVerifier verifier() {
        return new OracleBusinessAccountVerifier(jdbc);
    }
}
