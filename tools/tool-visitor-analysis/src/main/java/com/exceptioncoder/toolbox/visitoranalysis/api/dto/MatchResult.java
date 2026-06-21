package com.exceptioncoder.toolbox.visitoranalysis.api.dto;

/**
 * 确定性匹配结果（纯查库，无 LLM）。
 *
 * @param hitCustomer    是否命中历史客户库（手机/公司名/别名精确匹配）
 * @param customerStatus 命中时的客户状态（用于区分熟客/流失），可空
 * @param lastDealAt     命中时的最近成交时间（毫秒），可空
 * @param hitCompetitor  是否命中竞品名单（公司名/别名精确匹配）
 * @param competitorName 命中的竞品名（原始名），可空
 * @param visitCount     同一访客（手机/公司归一化）在历史台账中的出现次数（含本次前）
 * @param conclusive     是否已可确定性定论（命中客户或竞品）；false 表示灰区,需交 LLM
 * @param hitByAlias     命中方式：是否通过别名表匹配（非主名直接命中），影响证据文案
 * @param matchedAlias   命中的别名原始写法（hitByAlias=true 时有值），可空
 * @param addrHint       地址软匹配提示（城市+区，非空表示访客地址与客户库地址吻合），可空。
 *                       地址匹配不是定论依据，仅作为灰区 LLM 的补充上下文
 */
public record MatchResult(
        boolean hitCustomer,
        String customerStatus,
        Long lastDealAt,
        boolean hitCompetitor,
        String competitorName,
        int visitCount,
        boolean conclusive,
        boolean hitByAlias,
        String matchedAlias,
        String addrHint
) {
    /** 向前兼容构造：旧调用点不传新字段时默认无别名/无地址命中。 */
    public static MatchResult of(boolean hitCustomer, String customerStatus, Long lastDealAt,
                                 boolean hitCompetitor, String competitorName,
                                 int visitCount, boolean conclusive) {
        return new MatchResult(hitCustomer, customerStatus, lastDealAt,
                hitCompetitor, competitorName, visitCount, conclusive,
                false, null, null);
    }
}
