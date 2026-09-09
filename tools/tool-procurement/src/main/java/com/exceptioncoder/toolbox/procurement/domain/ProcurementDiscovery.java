package com.exceptioncoder.toolbox.procurement.domain;

import java.util.List;
import java.util.Map;
import java.util.function.Consumer;

/** 列表发现独立于正文与模型，省份未知必须显式保留。 */
public final class ProcurementDiscovery {
    private ProcurementDiscovery() { }
    public record Link(String title, String url, String date, String region, String metadata,
                       String province, String regionStatus) { }
    public record Event(String type, String source, String province, String status, int page, int pages,
                        int seen, String date, String error, List<Link> links) { }
    public interface Collector {
        void discover(String date, Consumer<Event> consumer);
    }
    public interface Store {
        void create(String id, String date);
        void accept(String id, Event event);
        void finish(String id, String status, String error);
        List<Map<String, Object>> batches();
        Map<String, Object> batch(String id);
        ProcurementData.Page<Map<String, Object>> links(String id, String regionStatus, int page);
        List<String> noticeIds(String id);
        void interrupt();
    }
}
