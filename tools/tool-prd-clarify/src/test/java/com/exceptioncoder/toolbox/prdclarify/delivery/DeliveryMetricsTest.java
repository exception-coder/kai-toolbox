package com.exceptioncoder.toolbox.prdclarify.delivery;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class DeliveryMetricsTest {

    private final DeliveryMetrics metrics = new DeliveryMetrics();

    @Test
    void calculatesWeightedCodeProgress() {
        assertThat(metrics.codeProgress(5, 2, 1)).isEqualTo(75);
        assertThat(metrics.codeProgress(0, 0, 0)).isNull();
    }

    @Test
    void normalizesOverallProgressWhenCodeIsUnknown() {
        assertThat(metrics.overallProgress(100, 0, null)).isEqualTo(55);
        assertThat(metrics.overallProgress(100, 100, 50)).isEqualTo(78);
    }

    @Test
    void deductsHealthForStaleAndMissingEvidence() {
        int score = metrics.health(true, true, true, true, true, 2, 3, 2);

        assertThat(score).isEqualTo(53);
        assertThat(metrics.grade(score)).isEqualTo("E");
    }
}
