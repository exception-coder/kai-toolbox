package com.exceptioncoder.toolbox.procurement.domain;

import java.util.Optional;
import static com.exceptioncoder.toolbox.procurement.domain.ProcurementData.*;

/** 公告本地快照与解析运行留痕，独立于业务字段。 */
public interface ProcurementCacheStore {
    /** 读取首次成功的页面快照。 */
    Optional<Capture> find(String noticeId);
    /** 首次写入，不覆盖既有成功快照。 */
    void save(String noticeId, Capture capture);
    /** 保存单次解析结果用于回查。 */
    void record(String noticeId, String runId, String text, String rules, Parsed result);
    /** 最近五十次解析记录，含每轮原始输出与字段裁决。 */
    java.util.List<java.util.Map<String, Object>> attempts(String noticeId);
    void saveExampleRun(String id, String createdAt, String result);
    java.util.List<String> exampleRuns();
}
