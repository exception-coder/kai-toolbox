package com.exceptioncoder.toolbox.common.dynamicconfig.annotation;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * 配置项中文说明。标在 {@code @ConfigurationProperties} 类的字段上，配置中心 UI 在该配置项旁展示，
 * 让使用者无需查代码即知道每项含义。说明随字段就近维护，单一来源。
 *
 * <p>仅作展示，不影响绑定/校验；未标注的字段在 UI 上说明为空。</p>
 */
@Target(ElementType.FIELD)
@Retention(RetentionPolicy.RUNTIME)
@Documented
public @interface ConfigDesc {

    /** 中文说明文案。 */
    String value();
}
