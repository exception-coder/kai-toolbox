package com.exceptioncoder.toolbox.docker.api.dto;

import java.util.List;

public record ContainerStatsResponse(long snapshotAt, List<ContainerStatsView> items) {}
