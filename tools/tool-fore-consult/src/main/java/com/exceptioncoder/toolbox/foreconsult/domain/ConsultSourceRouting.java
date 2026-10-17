package com.exceptioncoder.toolbox.foreconsult.domain;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;

/** 源码候选与分析焦点；与人工确认的数据归属分别存放在同一版本化证据路由快照。 */
public record ConsultSourceRouting(boolean automatic, String focusedProject, List<Project> projects,
                                   String evidencePath, String reason, String selectedBy) {
    private static final ObjectMapper MAPPER = new ObjectMapper();

    public record Project(String id, String name, String label, String path) { }

    public static ConsultSourceRouting read(String snapshot) {
        if (snapshot == null || snapshot.isBlank()) { return null; }
        try {
            var tree = MAPPER.readTree(snapshot);
            return tree.has("sourceRouting") ? MAPPER.treeToValue(tree.get("sourceRouting"), ConsultSourceRouting.class) : null;
        } catch (Exception error) {
            throw new IllegalArgumentException("咨询源码路由快照损坏，不能推定查询范围", error);
        }
    }

    public String wrap(String routes) {
        try {
            var out = MAPPER.createObjectNode();
            out.put("version", 2);
            out.set("routes", MAPPER.readTree(routes));
            out.set("sourceRouting", MAPPER.valueToTree(this));
            return MAPPER.writeValueAsString(out);
        } catch (Exception error) {
            throw new IllegalArgumentException("无法保存咨询源码路由", error);
        }
    }

    public boolean unresolved() { return automatic && focusedProject == null; }
}
