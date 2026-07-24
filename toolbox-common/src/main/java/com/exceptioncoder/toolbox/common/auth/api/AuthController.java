package com.exceptioncoder.toolbox.common.auth.api;

import com.exceptioncoder.toolbox.common.auth.AuthException;
import com.exceptioncoder.toolbox.common.auth.annotation.RequireAuth;
import com.exceptioncoder.toolbox.common.auth.annotation.RequireRole;
import com.exceptioncoder.toolbox.common.auth.api.dto.AdminUserView;
import com.exceptioncoder.toolbox.common.auth.api.dto.ChangePasswordRequest;
import com.exceptioncoder.toolbox.common.auth.api.dto.CreateUserRequest;
import com.exceptioncoder.toolbox.common.auth.api.dto.CurrentUserView;
import com.exceptioncoder.toolbox.common.auth.api.dto.LoginRequest;
import com.exceptioncoder.toolbox.common.auth.api.dto.RefreshRequest;
import com.exceptioncoder.toolbox.common.auth.api.dto.ResetPasswordRequest;
import com.exceptioncoder.toolbox.common.auth.api.dto.SetEnabledRequest;
import com.exceptioncoder.toolbox.common.auth.api.dto.TokenResponse;
import com.exceptioncoder.toolbox.common.auth.api.dto.UpdateRealNameRequest;
import com.exceptioncoder.toolbox.common.auth.api.dto.UpdateRolesRequest;
import com.exceptioncoder.toolbox.common.auth.domain.AuthUser;
import com.exceptioncoder.toolbox.common.auth.domain.JwtPayload;
import com.exceptioncoder.toolbox.common.auth.domain.TokenType;
import com.exceptioncoder.toolbox.common.auth.service.AuthUserService;
import com.exceptioncoder.toolbox.common.auth.service.TokenService;
import com.exceptioncoder.toolbox.common.auth.web.AuthContext;
import com.exceptioncoder.toolbox.common.auth.web.AuthPrincipal;
import jakarta.validation.Valid;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * 鉴权接口：登录 / 刷新 / 登出 / 当前用户 / 建用户 / 改密。
 * 仅在 toolbox.auth.enabled=true 时注册；接口契约见
 * ai-docs/kai-toolbox/design/JWT鉴权/JWT鉴权-api-current.md。
 */
@RestController
@RequestMapping("/api/auth")
@ConditionalOnProperty(prefix = "toolbox.auth", name = "enabled", havingValue = "true")
public class AuthController {

    private final AuthUserService userService;
    private final TokenService tokenService;

    public AuthController(AuthUserService userService, TokenService tokenService) {
        this.userService = userService;
        this.tokenService = tokenService;
    }

    @PostMapping("/login")
    public TokenResponse login(@Valid @RequestBody LoginRequest req) {
        AuthUser user = userService.authenticate(req.username(), req.password());
        return TokenResponse.from(tokenService.issueFor(user));
    }

    @PostMapping("/refresh")
    public TokenResponse refresh(@Valid @RequestBody RefreshRequest req) {
        return TokenResponse.from(tokenService.rotate(req.refreshToken()));
    }

    @PostMapping("/logout")
    @RequireAuth
    public Map<String, Object> logout() {
        AuthPrincipal principal = currentPrincipal();
        tokenService.logout(toPayload(principal));
        return Map.of("success", true);
    }

    @GetMapping("/me")
    @RequireAuth
    public CurrentUserView me() {
        return CurrentUserView.from(currentPrincipal());
    }

    @PostMapping("/users")
    @RequireRole("ADMIN")
    public CurrentUserView createUser(@Valid @RequestBody CreateUserRequest req) {
        return CurrentUserView.from(userService.create(req.username(), req.password(), req.roles(), req.realName()));
    }

    // ===== 账号管理（ADMIN）。设计见 ai-docs/kai-toolbox/design/JWT鉴权/账号管理/ =====

    @GetMapping("/users")
    @RequireRole("ADMIN")
    public List<AdminUserView> listUsers() {
        return userService.list().stream().map(AdminUserView::from).toList();
    }

    @PutMapping("/users/{id}/roles")
    @RequireRole("ADMIN")
    public AdminUserView updateRoles(@PathVariable long id, @Valid @RequestBody UpdateRolesRequest req) {
        AuthUser updated = userService.updateRoles(id, req.roles());
        // 角色变更后吊销该用户全部 refresh，使权限即时收敛。
        tokenService.revokeUserRefreshTokens(id);
        return AdminUserView.from(updated);
    }

    @PutMapping("/users/{id}/real-name")
    @RequireRole("ADMIN")
    public AdminUserView updateRealName(@PathVariable long id, @RequestBody UpdateRealNameRequest req) {
        return AdminUserView.from(userService.updateRealName(id, req.realName()));
    }

    @PutMapping("/users/{id}/enabled")
    @RequireRole("ADMIN")
    public AdminUserView setEnabled(@PathVariable long id, @RequestBody SetEnabledRequest req) {
        denySelf(id);
        AuthUser updated = userService.setEnabled(id, req.enabled());
        if (!req.enabled()) {
            tokenService.revokeUserRefreshTokens(id);
        }
        return AdminUserView.from(updated);
    }

    @PostMapping("/users/{id}/reset-password")
    @RequireRole("ADMIN")
    public Map<String, Object> resetPassword(@PathVariable long id, @Valid @RequestBody ResetPasswordRequest req) {
        userService.resetPassword(id, req.newPassword());
        tokenService.revokeUserRefreshTokens(id);
        return Map.of("success", true);
    }

    @DeleteMapping("/users/{id}")
    @RequireRole("ADMIN")
    public ResponseEntity<Void> deleteUser(@PathVariable long id) {
        denySelf(id);
        userService.delete(id);
        tokenService.revokeUserRefreshTokens(id);
        return ResponseEntity.noContent().build();
    }

    /** 禁止对当前登录账号本身停用/删除，避免锁死最后一个管理员。 */
    private void denySelf(long id) {
        if (AuthContext.current().map(p -> p.userId() == id).orElse(false)) {
            throw AuthException.selfForbidden();
        }
    }

    @PostMapping("/password")
    @RequireAuth
    public Map<String, Object> changePassword(@Valid @RequestBody ChangePasswordRequest req) {
        AuthPrincipal principal = currentPrincipal();
        userService.changePassword(principal.userId(), req.oldPassword(), req.newPassword());
        // 改密后吊销该用户全部 refresh，强制其它会话重新登录。
        tokenService.revokeUserRefreshTokens(principal.userId());
        return Map.of("success", true);
    }

    private AuthPrincipal currentPrincipal() {
        return AuthContext.current().orElseThrow(AuthException::tokenInvalid);
    }

    private JwtPayload toPayload(AuthPrincipal p) {
        return new JwtPayload(p.userId(), p.username(), p.roles(), p.permissionCodes(),
                p.jti(), TokenType.ACCESS, p.expiresAt());
    }
}
