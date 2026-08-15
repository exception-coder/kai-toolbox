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
    void keepsMissingSourceAndVerificationUnassessed() {
        assertThat(metrics.overallProgress(100, 0, null, null)).isEqualTo(10);
        assertThat(metrics.overallProgress(100, 100, null, null)).isEqualTo(20);
        assertThat(metrics.overallProgress(100, 100, 50, null)).isEqualTo(50);
        assertThat(metrics.overallProgress(100, 100, 50, 100)).isEqualTo(70);
        assertThat(metrics.overallProgress(100, 100, 100, 100)).isEqualTo(100);
    }

    @Test
    void calculatesRemainingAiWorkdaysFromOriginalEstimateAndCodeProgress() {
        DeliveryMetrics.EffortProjection projection = metrics.effortProjection(22, 34, 25);

        assertThat(projection.baselineWorkdaysMin()).isEqualTo(3.7);
        assertThat(projection.baselineWorkdaysMax()).isEqualTo(5.7);
        assertThat(projection.completedHoursMin()).isEqualTo(5.5);
        assertThat(projection.completedHoursMax()).isEqualTo(8.5);
        assertThat(projection.remainingHoursMin()).isEqualTo(16.5);
        assertThat(projection.remainingHoursMax()).isEqualTo(25.5);
        assertThat(projection.remainingWorkdaysMin()).isEqualTo(2.8);
        assertThat(projection.remainingWorkdaysMax()).isEqualTo(4.3);
    }

    @Test
    void preservesBaselineButDefersRemainingProjectionBeforeCodeAnalysis() {
        DeliveryMetrics.EffortProjection projection = metrics.effortProjection(12, 18, null);

        assertThat(projection.baselineWorkdaysMin()).isEqualTo(2.0);
        assertThat(projection.baselineWorkdaysMax()).isEqualTo(3.0);
        assertThat(projection.codeProgress()).isNull();
        assertThat(projection.remainingWorkdaysMin()).isNull();
    }

    @Test
    void deductsHealthForStaleAndMissingEvidence() {
        int score = metrics.health(true, true, true, true, true, 2, 3, 2);

        assertThat(score).isEqualTo(53);
        assertThat(metrics.grade(score)).isEqualTo("E");
    }
}
