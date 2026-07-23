package com.exceptioncoder.toolbox.common.forge.exception;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ResponseStatus;

/**
 * 已登录但缺少所需权限码。由 ForgeGuardInterceptor / service 层抛出，映射 403。
 */
@ResponseStatus(HttpStatus.FORBIDDEN)
public class ForbiddenException extends RuntimeException {
    public ForbiddenException(String message) {
        super(message);
    }

    public static ForbiddenException missingPermission(String code) {
        return new ForbiddenException("缺少权限：" + code);
    }

    public static ForbiddenException builtinRoleProtected() {
        return new ForbiddenException("内置角色不可删除、不可修改编码、不可收回权限");
    }
}
