package com.exceptioncoder.toolbox.prdclarify.api.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;

import java.util.List;

/**
 * {@code POST /sessions/{id}/split/adopt} 的请求体：用户从 {@code POST /sessions/{id}/split}
 * 返回的建议里勾选/编辑后确认要采纳的子需求列表。
 */
public record AdoptSplitRequest(@NotEmpty List<@Valid SplitItemView> items) {
}
