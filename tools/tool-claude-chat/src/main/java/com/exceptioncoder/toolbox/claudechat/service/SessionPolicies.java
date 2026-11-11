package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.domain.ClaudeChatSession;

/**
 * 会话执行策略规则：解析会话执行域，判断咨询只读 / 评审只读，并为只读会话强制安全默认值。
 * 纯规则，从 ClaudeChatService 拆出。
 */
final class SessionPolicies {

    private SessionPolicies() { }

    static String executionPolicyOf(ClaudeChatSession session) {
        if (SessionExecutionPolicy.CONSULT_GROUP_NAME.equals(session.getGroupName())) {
            return SessionExecutionPolicy.CONSULT_READONLY;
        }
        return SessionExecutionPolicy.normalize(session.getExecutionPolicy());
    }

    static boolean isConsultReadonly(SessionCtx ctx) {
        return SessionExecutionPolicy.isConsultReadonly(ctx.executionPolicy);
    }

    static boolean isReviewOnly(SessionCtx ctx) {
        return SessionExecutionPolicy.isReviewOnly(ctx.executionPolicy);
    }

    static void enforceReadonlyDefaults(SessionCtx ctx) {
        if (!isConsultReadonly(ctx) && !isReviewOnly(ctx)) return;
        ctx.mode = "plan";
        ctx.autoApprove = false;
        ctx.apiBaseUrl = null;
        ctx.authToken = null;
        if (isReviewOnly(ctx)) {
            // 旧评审会话可能已经被装入内存，不能只修数据库快照；每次绑定/恢复都重新建立
            // “Codex 官方默认”语义，由 Sidecar 按当前 Auth 的 model/list 解析默认推理强度。
            ctx.engine = "codex";
            ctx.currentModel = null;
            ctx.codexReasoningEffort = null;
            ctx.codexSpeed = "default";
        }
    }
}
