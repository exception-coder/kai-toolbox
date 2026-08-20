package com.exceptioncoder.toolbox.common.auth.api;

import com.exceptioncoder.toolbox.common.auth.api.dto.ExternalLoginResponse;
import com.exceptioncoder.toolbox.common.auth.api.dto.LoginRequest;
import com.exceptioncoder.toolbox.common.auth.domain.AuthUser;
import com.exceptioncoder.toolbox.common.auth.service.AuthUserService;
import com.exceptioncoder.toolbox.common.auth.service.TokenService;
import jakarta.validation.Valid;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 外部宿主复用 Forge 账号的短期登录入口。
 */
@RestController
@RequestMapping("/api/auth/external-login")
@ConditionalOnProperty(prefix = "toolbox.auth", name = {"enabled", "external-login.enabled"}, havingValue = "true")
public class ExternalLoginController {

    private final AuthUserService userService;
    private final TokenService tokenService;

    public ExternalLoginController(AuthUserService userService, TokenService tokenService) {
        this.userService = userService;
        this.tokenService = tokenService;
    }

    @PostMapping
    public ExternalLoginResponse login(@Valid @RequestBody LoginRequest request) {
        AuthUser user = userService.authenticate(request.username(), request.password());
        return ExternalLoginResponse.from(tokenService.issueAccessFor(user));
    }
}
