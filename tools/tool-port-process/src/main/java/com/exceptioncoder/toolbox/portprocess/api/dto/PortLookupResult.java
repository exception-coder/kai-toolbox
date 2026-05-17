package com.exceptioncoder.toolbox.portprocess.api.dto;

import java.util.List;

public record PortLookupResult(
        int port,
        String os,
        String command,
        long elapsedMs,
        List<PortProcessEntry> entries
) {}
