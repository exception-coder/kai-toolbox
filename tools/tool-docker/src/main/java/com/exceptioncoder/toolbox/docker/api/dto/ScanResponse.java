package com.exceptioncoder.toolbox.docker.api.dto;

import java.util.List;

public record ScanResponse(List<ScannedAppView> items) {}
