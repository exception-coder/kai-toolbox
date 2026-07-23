package com.exceptioncoder.toolbox.common.forge.api;

import com.exceptioncoder.toolbox.common.auth.AuthException;
import com.exceptioncoder.toolbox.common.auth.annotation.RequireAuth;
import com.exceptioncoder.toolbox.common.auth.web.AuthContext;
import com.exceptioncoder.toolbox.common.auth.web.AuthPrincipal;
import com.exceptioncoder.toolbox.common.forge.api.dto.CurrentPermissionView;
import com.exceptioncoder.toolbox.common.forge.service.ForgeGuardService;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 当前登录用户权限快照（FR-AUTH-04）。数据源为 JWT 携带的登录快照，非实时回源；
 * 前端刷新页面时调用以重建权限 store。
 */
@RestController
@RequestMapping("/api/forge/me")
@ConditionalOnProperty(prefix = "toolbox.auth", name = "enabled", havingValue = "true")
public class CurrentPermissionController {

    private final ForgeGuardService guardService;

    public CurrentPermissionController(ForgeGuardService guardService) {
        this.guardService = guardService;
    }

    @GetMapping("/permissions")
    @RequireAuth
    public CurrentPermissionView permissions() {
        AuthPrincipal principal = AuthContext.current().orElseThrow(AuthException::tokenInvalid);
        List<String> codes = principal.permissionCodes() == null ? List.of() : principal.permissionCodes();
        return new CurrentPermissionView(guardService.isSuperAdmin(principal), codes);
    }
}
