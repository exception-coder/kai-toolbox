package com.exceptioncoder.toolbox.visitoranalysis.api.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

/**
 * Yoooni 客户新增审批同步记录（{@code flowcheck_aiSyncCustAddAudit.action} 的 body 单条）。
 * 字段名对齐接口契约；{@code makeDate} 用 String 接收以兼容字符串/数字两种序列化，解析交上层。
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record CustAddAuditRecord(
        Long flowcheckid,          // 审批记录ID（幂等键 / 回写状态用）
        Long applyNo,              // 申请单号
        String applyTitle,        // 申请标题
        String applicant,         // 申请人
        String applyDept,         // 申请部门
        String makeDate,          // 生成日期（原始串）
        Long customerUpApplyLogId,// 申请详情主键 erp_flowapply.srcid
        String companyBrandName,  // 公司(品牌)名称
        String customerName,      // 客户关键字/简称
        String checkinAddress,    // 打卡地址
        String customerAddress    // 客户地址(门牌级)
) {
}
