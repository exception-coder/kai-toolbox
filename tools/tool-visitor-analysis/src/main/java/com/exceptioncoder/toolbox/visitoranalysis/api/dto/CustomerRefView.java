package com.exceptioncoder.toolbox.visitoranalysis.api.dto;

/**
 * 客户资料去重参照库的一条记录（镜像原系统"客户资料"）。
 * 这些数据是 V1 客户新增申请去重的检索底库，前端"历史客户资料库"表格直接展示它。
 */
public record CustomerRefView(
        long id,
        Long custId,
        String custName,
        String keyword,
        String brandName,
        String custType,
        String custCategory,
        String bizMajor,
        String province,
        String city,
        String district,
        String custAddr,
        String checkinAddr,
        Double lng,
        Double lat,
        String level,
        String custProperty,
        String creator,
        String note,
        long createdAt,
        Long syncedAt
) {
}
