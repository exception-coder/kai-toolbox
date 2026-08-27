package com.exceptioncoder.toolbox.common.scheduling;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Marks a no-argument method as a task managed by the toolbox scheduler.
 * Exactly one of cron, fixedRateString and fixedDelayString must be configured.
 */
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
public @interface ToolboxScheduled {
    String id();
    String name();
    String description() default "";
    String owner() default "";
    String cron() default "";
    String zone() default "";
    String fixedRateString() default "";
    String fixedDelayString() default "";
    String initialDelayString() default "0";
    ConcurrentExecutionPolicy concurrency() default ConcurrentExecutionPolicy.SKIP_IF_RUNNING;
}
