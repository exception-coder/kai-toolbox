package com.exceptioncoder.toolbox.procurement.domain;

import java.util.List;
import java.util.Map;

/** 稳定字段键与版本将展示结构、模型契约、人工覆盖连接起来。 */
public final class ProcurementStructure {
    private ProcurementStructure() { }

    public record Field(String key, String label, String group, String type, String mode,
                        String description, boolean enabled, int order) { }
    public record Schema(int version, List<Field> fields) { }
    public record Overrides(int version, Map<String, String> values) { }
    public record Correction(int schemaVersion, int version, Map<String, String> values) { }
    public record Value(Field field, String value, String source, List<Map<String, String>> evidence,
                        List<String> alternatives, boolean overridden) { }
    public record Result(int schemaVersion, int analysisVersion, int version, List<Value> values,
                         Map<String, String> overrides) { }
}
