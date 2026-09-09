package com.exceptioncoder.toolbox.procurement.domain;

import java.util.List;
import java.util.Map;
import static com.exceptioncoder.toolbox.procurement.domain.ProcurementData.*;

/** 招采数据端口，应用层不依赖 JDBC。 */
public interface ProcurementStore {
    /** @return 所有站点 */
    List<Site> sites();
    /** @param site 待保存站点 */
    void saveSite(Site site);
    /** @return 所有规则 */
    List<Rule> rules();
    /** @param rule 待保存规则 */
    void saveRule(Rule rule);
    /** @param id 删除规则 ID */
    void deleteRule(String id);
    /** @param query 查询条件 @return 分页摘要 */
    Page<Notice> notices(NoticeQuery query);
    /** @param id 公告 ID @return 公告正文 */
    Notice notice(String id);
    /** @param notice 新公告 @return 是否新增 */
    boolean addNotice(Notice notice);
    /** @param siteId 可选站点 @param noticeId 可选公告 @return 有界任务输入 */
    List<Notice> targets(String siteId, String noticeId);
    /** @param notice 采集后的公告 */
    void saveCapture(Notice notice);
    /** @return 工作区统计 */
    Map<String, Long> overview();
    /** @return 最近任务 */
    List<Run> runs();
    /** @param run 任务 @param snapshot 启动时规则快照 */
    void createRun(Run run, String snapshot);
    /** @param run 最新进度 */
    void updateRun(Run run);
}
