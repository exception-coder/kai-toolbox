package com.exceptioncoder.toolbox.downloader.api.dto;

import com.exceptioncoder.toolbox.downloader.domain.ProxyCandidate;

import java.time.Instant;
import java.util.List;

public record ProxyProbeResult(
        List<ProxyCandidateView> candidates,
        ProxyCandidateView effective,
        Instant detectedAt) {

    public static ProxyProbeResult of(List<ProxyCandidate> all) {
        List<ProxyCandidateView> views = all.stream().map(ProxyCandidateView::of).toList();
        return new ProxyProbeResult(views, views.isEmpty() ? null : views.get(0), Instant.now());
    }
}
