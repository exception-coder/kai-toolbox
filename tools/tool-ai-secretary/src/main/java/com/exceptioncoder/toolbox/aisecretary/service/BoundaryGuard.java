package com.exceptioncoder.toolbox.aisecretary.service;

import org.springframework.stereotype.Service;

/**
 * 禁区出参拦截（红线兜底）——本接缝已接进回忆链路，<b>当前为直通占位</b>。
 *
 * <p>设计意图（见「长期记忆与用户画像」方案 R7，Phase 2 实现）：在 LLM 给出回答后、下发前，
 * 用代码核对答案是否触碰用户「禁区(BOUNDARY)」记忆——这是「LLM 输出当不可信入参」的体现，
 * 红线不能只靠注入 prompt 自觉遵守，需出参侧再确定性校验一次。
 *
 * <p>Phase 2 落地方向（填本方法体即可，无需改调用方）：
 * <ol>
 *   <li>注入 {@code MemoryRepository}，取 active 的 BOUNDARY 记忆；</li>
 *   <li>命中红线 → 拦截/改写/重生成（或返回安全话术），并可记一条审计；</li>
 *   <li>可配开关与策略（拦截 vs 仅告警）。</li>
 * </ol>
 */
@Service
public class BoundaryGuard {

    /** 出参红线校验。MVP 直通返回原文；Phase 2 在此实现拦截/改写。 */
    public String review(String answer) {
        // Phase 2：取 active BOUNDARY，校验 answer 是否触红线，违反则拦截/重生成。
        return answer;
    }
}
