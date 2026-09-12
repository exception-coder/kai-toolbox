package com.exceptioncoder.toolbox.foreconsult.domain.teaching;

import java.util.List;

/** 未提交的教学草稿；状态只由确定性校验产生。 */
public record OrderDraft(
        /** 契约版本。 */ String contractVersion,
        /** 用户提供的款号。 */ String styleCode,
        /** 唯一 ERP 款号；未确认时为空。 */ String sku,
        /** 提议数量。 */ Integer quantity,
        /** 校验状态。 */ String status,
        /** 需补充或纠正的问题。 */ List<String> issues) {
}
