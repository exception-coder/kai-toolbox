package com.exceptioncoder.toolbox.knowledgegraph.api.dto;

import com.exceptioncoder.toolbox.knowledgegraph.model.ProjectStatusSnapshot;

import java.util.Map;

public record StatusCacheView(Map<String, ProjectStatusSnapshot> statuses) {
}
