package com.exceptioncoder.toolbox.visitoranalysis.api.dto;

/**
 * 确定性匹配结果（纯查库，无 LLM）。
 *
 * @param hitCustomer   是否命中历史客户库
 * @param customerStatus 命中时的客户状态（用于区分熟客/流失），可空
 * @param lastDealAt    命中时的最近成交时间（毫秒），可空
 * @param hitCompetitor 是否命中竞品名单
 * @param competitorName 命中的竞品名（原始名），可空
 * @param visitCount    同一访客（手机/公司归一化）在历史台账中的出现次数（含本次前）
 * @param conclusive    是否已可确定性定论（命中客户或竞品）；false 表示灰区,需交 LLM
 */
public record MatchResult(
        boolean hitCustomer,
        String customerStatus,
        Long lastDealAt,
        boolean hitCompetitor,
        String competitorName,
        int visitCount,
        boolean conclusive
) {
}
