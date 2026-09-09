package com.exceptioncoder.toolbox.procurement.domain;

import static com.exceptioncoder.toolbox.procurement.domain.ProcurementStructure.*;

/** 结构版本及人工覆盖的持久化端口。 */
public interface ProcurementStructureStore {
    Schema schema();
    Schema save(Schema schema);
    Overrides overrides(String noticeId);
    /** 单次读取一页公告的人工修正，避免逐公告查询。 */
    java.util.Map<String, Overrides> overrides(java.util.List<String> noticeIds);
    void saveOverrides(String noticeId, Correction correction);
}
