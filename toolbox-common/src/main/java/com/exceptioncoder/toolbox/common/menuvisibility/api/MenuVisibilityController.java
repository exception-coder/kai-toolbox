package com.exceptioncoder.toolbox.common.menuvisibility.api;

import com.exceptioncoder.toolbox.common.auth.AuthException;
import com.exceptioncoder.toolbox.common.auth.annotation.RequireAuth;
import com.exceptioncoder.toolbox.common.auth.web.AuthContext;
import com.exceptioncoder.toolbox.common.auth.web.AuthPrincipal;
import com.exceptioncoder.toolbox.common.menuvisibility.api.dto.MenuVisibilitySaveRequest;
import com.exceptioncoder.toolbox.common.menuvisibility.api.dto.MenuVisibilityView;
import com.exceptioncoder.toolbox.common.menuvisibility.service.MenuVisibilityService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 菜单显隐（按登录用户）读写接口。
 * userId 一律从登录态 {@link AuthContext} 取，绝不接受前端传入的 user——避免越权改他人配置。
 */
@RestController
@RequestMapping("/api/menu-visibility")
@RequireAuth
public class MenuVisibilityController {

    private final MenuVisibilityService service;

    public MenuVisibilityController(MenuVisibilityService service) {
        this.service = service;
    }

    private static long currentUserId() {
        AuthPrincipal principal = AuthContext.current().orElseThrow(AuthException::tokenInvalid);
        return principal.userId();
    }

    /** 当前用户的可见白名单；无记录返回 visibleIds=null（前端走默认/迁移）。 */
    @GetMapping
    public MenuVisibilityView get() {
        long userId = currentUserId();
        return service.find(userId)
                .map(mv -> MenuVisibilityView.from(mv, service))
                .orElseGet(MenuVisibilityView::empty);
    }

    /** upsert 当前用户的可见白名单。 */
    @PutMapping
    public MenuVisibilityView save(@Valid @RequestBody MenuVisibilitySaveRequest req) {
        long userId = currentUserId();
        return MenuVisibilityView.from(service.save(userId, req.visibleIds()), service);
    }

    /** 恢复默认：删除当前用户记录。 */
    @DeleteMapping
    public ResponseEntity<Void> reset() {
        service.reset(currentUserId());
        return ResponseEntity.noContent().build();
    }
}
