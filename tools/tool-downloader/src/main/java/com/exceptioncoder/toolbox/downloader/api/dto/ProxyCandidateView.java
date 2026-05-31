package com.exceptioncoder.toolbox.downloader.api.dto;

import com.exceptioncoder.toolbox.downloader.domain.ProxyCandidate;

public record ProxyCandidateView(String source, String type, String host, int port, String originUrl) {

    public static ProxyCandidateView of(ProxyCandidate c) {
        return new ProxyCandidateView(c.source().name(), c.type(), c.host(), c.port(), c.originUrl());
    }
}
