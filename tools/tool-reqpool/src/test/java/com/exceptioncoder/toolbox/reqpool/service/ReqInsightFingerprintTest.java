package com.exceptioncoder.toolbox.reqpool.service;

import com.exceptioncoder.toolbox.reqpool.domain.ReqItem;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class ReqInsightFingerprintTest {

    private final ReqInsightFingerprint fingerprint = new ReqInsightFingerprint();

    @Test
    void sourceHashChangesOnlyWhenSourceFactsChange() {
        ReqItem item = item("req-1", "标题", "描述");
        String original = fingerprint.sourceHash(item);

        item.setPriority("HIGH");
        assertThat(fingerprint.sourceHash(item)).isEqualTo(original);

        item.setDescription("新描述");
        assertThat(fingerprint.sourceHash(item)).isNotEqualTo(original);
    }

    @Test
    void portfolioHashIsOrderIndependentAndTracksMembership() {
        ReqItem first = item("req-1", "一", "描述一");
        ReqItem second = item("req-2", "二", "描述二");

        assertThat(fingerprint.portfolioSetHash(List.of(first, second)))
                .isEqualTo(fingerprint.portfolioSetHash(List.of(second, first)))
                .isNotEqualTo(fingerprint.portfolioSetHash(List.of(first)));
    }

    private static ReqItem item(String id, String title, String description) {
        return ReqItem.builder()
                .id(id)
                .title(title)
                .description(description)
                .project("kai-toolbox")
                .module("reqpool")
                .priority("MEDIUM")
                .status("DRAFT")
                .build();
    }
}
