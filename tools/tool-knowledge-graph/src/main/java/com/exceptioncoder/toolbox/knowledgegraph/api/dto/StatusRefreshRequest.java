package com.exceptioncoder.toolbox.knowledgegraph.api.dto;

import java.util.List;

public record StatusRefreshRequest(List<String> paths) {
}
