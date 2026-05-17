package com.exceptioncoder.toolbox.portprocess.api.dto;

public record PortProcessEntry(
        String protocol,
        String family,
        String localAddress,
        int localPort,
        String remoteAddress,
        String state,
        Long pid,
        String processName,
        String command
) {}
