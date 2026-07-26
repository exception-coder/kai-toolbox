package com.exceptioncoder.toolbox.common.menuvisibility.api.dto;

import com.exceptioncoder.toolbox.common.menuvisibility.domain.MenuVisibility;
import com.exceptioncoder.toolbox.common.menuvisibility.service.MenuVisibilityService;

import java.util.List;

/**
 * GET /api/menu-visibility 响应体。
 * visibleIds=null 表示该用户在库内无记录——前端据此走「默认核心集 / localStorage 迁移」。
 */
public record MenuVisibilityView(List<String> visibleIds, Long updatedAt) {

    /** 无记录：可见集为 null，前端识别为「未定制」。 */
    public static MenuVisibilityView empty() {
        return new MenuVisibilityView(null, null);
    }

    public static MenuVisibilityView from(MenuVisibility mv, MenuVisibilityService service) {
        return new MenuVisibilityView(service.parseIds(mv), mv.getUpdatedAt());
    }
}
