package com.exceptioncoder.toolbox.common.development;

/**
 * 需求负责人进入开发会话的跨工具授权策略。
 *
 * <p>接口放在 common，需求中枢负责实现；Vibe Coding 只依赖这个稳定契约，
 * 不直接读取 reqpool 的表或 Java 类型。</p>
 */
public interface RequirementDevelopmentAccessPolicy {

    /** 当前账号是否是该 PRD 对应需求的负责人。ADMIN 由调用方单独放行。 */
    boolean canDevelop(long userId, String prdSessionId);

}
