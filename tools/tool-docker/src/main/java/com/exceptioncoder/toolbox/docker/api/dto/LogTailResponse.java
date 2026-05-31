package com.exceptioncoder.toolbox.docker.api.dto;

import java.util.List;

public record LogTailResponse(List<String> lines, boolean truncated) {}
