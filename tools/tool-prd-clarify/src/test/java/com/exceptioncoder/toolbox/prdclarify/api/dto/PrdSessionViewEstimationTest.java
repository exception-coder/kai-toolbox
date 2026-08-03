package com.exceptioncoder.toolbox.prdclarify.api.dto;

import com.exceptioncoder.toolbox.prdclarify.domain.PrdSession;
import com.exceptioncoder.toolbox.prdclarify.service.EstimationEvidenceFingerprint;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;

class PrdSessionViewEstimationTest {

    private final ObjectMapper mapper = new ObjectMapper();

    @TempDir
    Path tempDir;

    @Test
    void marksEstimationStaleWhenPrdOrTddContentChanges() throws Exception {
        Path prd = tempDir.resolve("prd.md");
        Path tdd = tempDir.resolve("prd-dev.md");
        Files.writeString(prd, "PRD v1");
        Files.writeString(tdd, "TDD v1");

        ObjectNode estimation = mapper.createObjectNode();
        estimation.put("hoursMin", 4);
        estimation.put("hoursMax", 8);
        estimation.put("estimatedAt", System.currentTimeMillis());
        estimation.put("prdPath", prd.toString());
        estimation.put("tddPath", tdd.toString());
        estimation.put("prdFingerprint", EstimationEvidenceFingerprint.text("PRD v1"));
        estimation.put("tddFingerprint", EstimationEvidenceFingerprint.text("TDD v1"));
        estimation.putArray("breakdown");
        estimation.putArray("inspectedFiles");

        PrdSession session = PrdSession.builder()
                .id("root")
                .title("需求")
                .status("DONE")
                .devDocEstimation(mapper.writeValueAsString(estimation))
                .build();

        assertThat(PrdSessionView.from(session).devDocEstimation().stale()).isFalse();

        Files.writeString(prd, "PRD v2");
        Files.writeString(tdd, "TDD v2");
        PrdSessionView.DevDocEstimationView changed = PrdSessionView.from(session).devDocEstimation();

        assertThat(changed.stale()).isTrue();
        assertThat(changed.staleReasons()).containsExactly("PRD 已更新", "TDD 已更新");
    }
}
