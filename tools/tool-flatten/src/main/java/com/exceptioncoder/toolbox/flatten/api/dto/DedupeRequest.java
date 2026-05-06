package com.exceptioncoder.toolbox.flatten.api.dto;

import java.util.List;

public record DedupeRequest(List<String> keepPaths) {}
