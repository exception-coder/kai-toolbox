package com.exceptioncoder.toolbox.visitoranalysis.api.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

/**
 * Yoooni 客户底库同步记录（{@code cust_aiSyncCustomers.action} 的 body 单条）。
 * 经纬度/lastdate 用 String 接收以兼容字符串/数字序列化，解析交服务层。
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record CustomerSyncRecord(
        Long custId,            // 客户主键 CRM_CUSTOMER.id
        String name,            // 客户名称
        String briefname,       // 客户简称/关键字
        String address,         // 客户地址
        String doorcode,        // 门牌
        String checkinAddress,  // 打卡地址（crm_customerupapplylog.address）
        String tel,             // 企业电话（CRM_CUSTOMER.tel）
        String contactMobile,   // 联系人手机（CRM_CUSLINKER.mobile 代表性一个）
        String longitude,       // 经度
        String latitude,        // 纬度
        String lastdate         // 最后修改时间（增量水位）
) {
}
