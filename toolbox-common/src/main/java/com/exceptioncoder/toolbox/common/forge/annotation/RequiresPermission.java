package com.exceptioncoder.toolbox.common.forge.annotation;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * 声明访问 Controller 方法/类所需的权限码。由 ForgeGuardInterceptor 在 MVC 阶段强制。
 * 持有 value 中任一权限码即放行（OR 语义）；超级管理员 bypass；未登录 401、缺码 403。
 * 取代 {@code @SoftGuard} 的静默降级语义（FR-GUARD）。
 */
@Target({ElementType.METHOD, ElementType.TYPE})
@Retention(RetentionPolicy.RUNTIME)
public @interface RequiresPermission {

    /** 所需权限码集合，命中任一即放行。 */
    String[] value();
}
