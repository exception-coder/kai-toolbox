package com.exceptioncoder.toolbox.prdclarify.service;

import com.exceptioncoder.toolbox.prdclarify.domain.PrdPromptDefinition;
import com.exceptioncoder.toolbox.prdclarify.domain.PrdPromptPurpose;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class PrdPromptCatalogTest {

    @Test
    void loadsImmutableVersionedResourcesAndStableHashes() {
        PrdPromptCatalog catalog = new PrdPromptCatalog();

        PrdPromptDefinition analyzer = catalog.get(PrdPromptPurpose.DOC_CHANGE_ANALYZER);
        PrdPromptDefinition verifier = catalog.get(PrdPromptPurpose.DOC_CHANGE_VERIFIER);
        PrdPromptDefinition progress = catalog.get(PrdPromptPurpose.PROGRESS_EVALUATION);

        assertThat(analyzer.version()).isEqualTo("v3-plain-questions");
        assertThat(analyzer.systemPrompt()).contains("证据分析器", "diffLedger");
        assertThat(verifier.version()).isEqualTo("v1");
        assertThat(verifier.systemPrompt()).contains("复核器", "recommendedDecision");
        assertThat(progress.version()).isEqualTo("v1");
        assertThat(progress.systemPrompt()).contains("source_context", "文档与代码差异");
        assertThat(analyzer.sha256()).hasSize(64);
        assertThat(catalog.analysisProtocolFingerprint()).hasSize(64);
        assertThat(new PrdPromptCatalog().analysisProtocolFingerprint())
                .isEqualTo(catalog.analysisProtocolFingerprint());
    }
}
