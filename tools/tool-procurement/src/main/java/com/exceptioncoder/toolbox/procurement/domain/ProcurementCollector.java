package com.exceptioncoder.toolbox.procurement.domain;

import java.util.Set;
import static com.exceptioncoder.toolbox.procurement.domain.ProcurementData.*;

/** 公告网页采集端口。 */
public interface ProcurementCollector {
    /** @param url 已校验来源 @param hosts 允许访问站点 @return 可回查正文及链接 */
    Capture capture(String url, Set<String> hosts);
}
