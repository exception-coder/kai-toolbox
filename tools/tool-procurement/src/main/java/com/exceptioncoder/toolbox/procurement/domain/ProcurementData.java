package com.exceptioncoder.toolbox.procurement.domain;

import java.util.List;
import java.util.Map;

/** 招采工作区数据契约，历史来源与实时证据分别保存。 */
public final class ProcurementData {
    private ProcurementData() { }

    /** 站点及允许发现公告的列表入口。 */
    public record Site(String id, String name, String host, Boolean enabled, String listUrl, String notes) { }

    /** Excel 四类规则共用字段字典，保持源表列名可编辑。 */
    public record Rule(String id, String category, String name, Boolean enabled, Map<String, String> fields) { }

    /** 公告正文与解析结果；历史 Excel 字段不参与新采集成功判定。 */
    public record Notice(String id, String siteId, String url, String title, String captureStatus,
                         String parseStatus, String rawText, String finalUrl, String frameUrl,
                         Integer httpStatus, String capturedAt, String error, String candidates,
                         String analysis, String sourceData, String runId, String updateTime) { }

    /** 有界采集任务进度。 */
    public record Run(String id, String status, Integer total, Integer processed, Integer succeeded,
                      Integer failed, String error, String createTime, String updateTime) { }

    /** 采集适配结果。 */
    public record Capture(String title, String text, String finalUrl, String frameUrl, Integer httpStatus,
                          List<Link> links, String html, List<PageFrame> frames) {
        public Capture(String title, String text, String finalUrl, String frameUrl, Integer httpStatus, List<Link> links) {
            this(title, text, finalUrl, frameUrl, httpStatus, links, "", List.of());
        }
    }

    /** 渲染完成的同站点框架内容，不执行缓存中的脚本。 */
    public record PageFrame(String url, String html, String text) { }

    /** 列表页发现的来源链接。 */
    public record Link(String title, String url) { }

    /** 解析状态与已校验证据 JSON。 */
    public record Parsed(String status, String candidates, String analysis, String error) { }

    /** 分页查询，最多返回一百条。 */
    public record NoticeQuery(String search, String siteId, String status, Integer page, boolean discoveredOnly) {
        public NoticeQuery(String search, String siteId, String status, Integer page) {
            this(search, siteId, status, page, false);
        }
    }

    /** 分页列表。 */
    public record Page<T>(List<T> items, Long total, Integer page, Integer pageSize) { }
}
