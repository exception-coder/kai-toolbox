package com.exceptioncoder.toolbox.prdclarify.api.dto;

import java.util.List;

/**
 * {@code POST /sessions/{id}/split} 的响应：AI 对「这个需求是否该拆」的判断，仅供预览，
 * 不落库——用户在前端确认/编辑后调 {@code POST /sessions/{id}/split/adopt} 才真正创建子草稿。
 *
 * @param canSplit true 表示 AI 建议拆分；false 表示需求本身已经足够聚焦，items 为空数组
 * @param reason   一两句话说明判断依据
 * @param items    建议拆出的子需求列表（canSplit=false 时为空）
 */
public record SplitPreviewView(boolean canSplit, String reason, List<SplitItemView> items) {
}
