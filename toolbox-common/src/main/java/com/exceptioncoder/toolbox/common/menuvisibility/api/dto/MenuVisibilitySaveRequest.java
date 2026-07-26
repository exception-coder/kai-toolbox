package com.exceptioncoder.toolbox.common.menuvisibility.api.dto;

import jakarta.validation.constraints.NotNull;

import java.util.List;

/**
 * PUT /api/menu-visibility 请求体。
 * visibleIds = 该用户希望在菜单显示的模块 id 白名单；元素合法性由 Service 层校验。
 */
public record MenuVisibilitySaveRequest(@NotNull List<String> visibleIds) {
}
