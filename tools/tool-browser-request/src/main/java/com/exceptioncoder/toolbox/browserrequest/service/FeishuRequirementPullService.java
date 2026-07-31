package com.exceptioncoder.toolbox.browserrequest.service;

import com.exceptioncoder.toolbox.browserrequest.config.BrowserSessionManager;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.zip.GZIPInputStream;

/**
 * 使用浏览器 Cookie 只读加载飞书多维表格，并从页面真实收到的 JSON 响应中归一化需求记录。
 */
@Service
public class FeishuRequirementPullService {

    private static final int PAGE_SIZE = 3_000;
    private static final int MAX_RECORDS = 20_000;
    private static final int MAX_PAGES = (MAX_RECORDS + PAGE_SIZE - 1) / PAGE_SIZE;
    private static final Set<String> RECORD_CONTAINERS = Set.of(
            "records", "recordlist", "record_list", "recordmap", "record_map");
    private static final List<String> FIELD_CONTAINERS = List.of(
            "fields", "fieldValues", "field_values", "cellValues", "cell_values", "values", "data");
    private static final List<String> TITLE_FIELDS = List.of(
            "需求标题", "需求名称", "标题", "名称", "主题", "title", "name", "summary");
    /** 当前业务需求收集表的稳定字段 ID；clientvars 未返回字段元数据时用于保留业务语义。 */
    private static final Map<String, String> KNOWN_REQUIREMENT_FIELDS = Map.ofEntries(
            Map.entry("fld4EZgUc8", "需求标题"),
            Map.entry("fld4MyICot", "需求详情"),
            Map.entry("fld57ObEhK", "需求背景/业务痛点"),
            Map.entry("fld2JgJuVL", "需求类型"),
            Map.entry("fld43K1LNl", "需求软件"),
            Map.entry("fld6iE5Iix", "发起部门"),
            Map.entry("fldeHXs8Cx", "提出人"),
            Map.entry("fld1K9bTud", "提出日期"),
            Map.entry("fld79KCQet", "附件"),
            Map.entry("fldwa51TeQ", "跟进记录"));
    private static final Map<String, String> KNOWN_REQUIREMENT_TYPE_OPTIONS = Map.of(
            "optki0Xnkb", "功能优化",
            "optQ9FhwmC", "新需求",
            "optaw9hHim", "数据异常",
            "optph80OtF", "系统缺陷");

    private final BrowserSessionManager browserSessionManager;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;

    @Autowired
    public FeishuRequirementPullService(BrowserSessionManager browserSessionManager, ObjectMapper objectMapper) {
        this(browserSessionManager, objectMapper, HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(15))
                .followRedirects(HttpClient.Redirect.NEVER)
                .build());
    }

    FeishuRequirementPullService(BrowserSessionManager browserSessionManager,
                                 ObjectMapper objectMapper,
                                 HttpClient httpClient) {
        this.browserSessionManager = browserSessionManager;
        this.objectMapper = objectMapper;
        this.httpClient = httpClient;
    }

    public PullResult pull(String rawUrl, String cookie) {
        return pull(rawUrl, cookie, null);
    }

    public PullResult pull(String rawUrl, String cookie, String recordsUrl) {
        String url = validateUrl(rawUrl);
        if (recordsUrl != null && !recordsUrl.isBlank()) {
            return pullDirect(url, cookie, recordsUrl);
        }
        return pullWithBrowserFallback(url, cookie);
    }

    private PullResult pullWithBrowserFallback(String url, String cookie) {
        if (browserSessionManager == null) {
            throw new IllegalArgumentException("HAR 中缺少飞书 records 请求地址，无法执行 Cookie 直连同步");
        }
        List<BrowserSessionManager.CapturedJsonResponse> responses =
                browserSessionManager.captureJsonResponses(url, cookie, 7_000);
        List<String> tableResponses = responses.stream()
                .filter(response -> isTableDataResponse(response.url()))
                .map(BrowserSessionManager.CapturedJsonResponse::body)
                .toList();
        List<RequirementRow> rows = extractRows(tableResponses);
        if (rows.isEmpty()) {
            throw new IllegalArgumentException(
                    "未从飞书页面识别到表格记录。请确认 Cookie 尚未过期、当前账号有该视图权限，并粘贴完整 Cookie 请求头");
        }
        URI uri = URI.create(url);
        Map<String, String> query = parseQuery(uri.getRawQuery());
        return new PullResult(
                url,
                "",
                query.getOrDefault("table", ""),
                query.getOrDefault("view", ""),
                rows.size(),
                tableResponses.isEmpty() ? 0 : 1,
                "BROWSER_FALLBACK",
                rows);
    }

    private PullResult pullDirect(String sourceUrl, String cookie, String rawRecordsUrl) {
        if (cookie == null || cookie.isBlank()) {
            throw new IllegalArgumentException("HAR 中的 Cookie 为空，请重新导出包含敏感数据的 HAR");
        }
        RecordsEndpoint endpoint = validateRecordsUrl(sourceUrl, rawRecordsUrl);
        List<String> decodedPages = new ArrayList<>();
        int offset = 0;
        int expectedTotal = -1;

        for (int page = 0; page < MAX_PAGES; page++) {
            URI pageUri = buildPageUri(endpoint.uri(), offset);
            JsonNode envelope = sendRecordsRequest(pageUri, sourceUrl, cookie);
            JsonNode decoded = decodeCompressedRecords(envelope);
            if (decoded == null || !decoded.isObject()) {
                throw new IllegalArgumentException("飞书 records 响应缺少可解压的数据，请重新导出 HAR 后再试");
            }

            JsonNode recordMap = decoded.path("recordMap");
            int pageRecords = recordMap.isObject() ? recordMap.size() : 0;
            if (expectedTotal < 0 && decoded.path("tableRecordNum").canConvertToInt()) {
                expectedTotal = decoded.path("tableRecordNum").asInt();
                if (expectedTotal > MAX_RECORDS) {
                    throw new IllegalArgumentException(
                            "飞书表格共有 " + expectedTotal + " 条记录，超过当前安全上限 " + MAX_RECORDS + " 条");
                }
            }
            decodedPages.add(decoded.toString());
            offset += pageRecords;

            if (pageRecords == 0
                    || pageRecords < PAGE_SIZE
                    || (expectedTotal >= 0 && offset >= expectedTotal)) {
                List<RequirementRow> rows = extractRows(decodedPages);
                if (expectedTotal > 0 && rows.isEmpty()) {
                    throw new IllegalArgumentException("飞书返回了记录，但未能识别表格字段结构");
                }
                URI source = URI.create(sourceUrl);
                Map<String, String> sourceQuery = parseQuery(source.getRawQuery());
                return new PullResult(
                        sourceUrl,
                        endpoint.appToken(),
                        endpoint.tableId(),
                        endpoint.viewId().isBlank()
                                ? sourceQuery.getOrDefault("view", "")
                                : endpoint.viewId(),
                        rows.size(),
                        decodedPages.size(),
                        "COOKIE_DIRECT",
                        rows);
            }
        }
        throw new IllegalArgumentException("飞书记录分页超过安全上限，请缩小表格范围后重试");
    }

    private JsonNode sendRecordsRequest(URI uri, String sourceUrl, String cookie) {
        HttpRequest request = HttpRequest.newBuilder(uri)
                .timeout(Duration.ofSeconds(30))
                .header("Accept", "application/json, text/plain, */*")
                .header("Cookie", cookie)
                .header("Referer", sourceUrl)
                .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/150 Safari/537.36")
                .GET()
                .build();
        try {
            HttpResponse<String> response =
                    httpClient.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            if (response.statusCode() != 200) {
                throw new IllegalArgumentException("飞书数据接口请求失败（HTTP " + response.statusCode() + "）");
            }
            JsonNode envelope = objectMapper.readTree(response.body());
            int code = envelope.path("code").asInt(-1);
            if (code == 5) {
                throw new IllegalArgumentException("飞书 Cookie 已失效或账号未登录，请重新导出 HAR");
            }
            if (code != 0) {
                String message = envelope.path("msg").asText("");
                throw new IllegalArgumentException(
                        "飞书数据接口返回错误（code=" + code + "）"
                                + (message.isBlank() ? "" : "：" + message));
            }
            return envelope;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalArgumentException("飞书数据同步被中断");
        } catch (IOException e) {
            throw new IllegalArgumentException("无法连接飞书数据接口：" + e.getMessage());
        }
    }

    static RecordsEndpoint validateRecordsUrl(String sourceUrl, String rawRecordsUrl) {
        URI source = URI.create(sourceUrl);
        URI records;
        try {
            records = URI.create(rawRecordsUrl == null ? "" : rawRecordsUrl.trim());
        } catch (Exception e) {
            throw new IllegalArgumentException("HAR 中的飞书 records 请求地址无效");
        }
        String host = records.getHost();
        if (!"https".equalsIgnoreCase(records.getScheme())
                || host == null
                || !(host.equals("feishu.cn") || host.endsWith(".feishu.cn"))
                || !host.equalsIgnoreCase(source.getHost())) {
            throw new IllegalArgumentException("HAR records 请求必须与飞书表格链接使用同一站点");
        }
        String[] segments = records.getPath().split("/");
        if (segments.length != 7
                || !"space".equals(segments[1])
                || !"api".equals(segments[2])
                || !"v1".equals(segments[3])
                || !"bitable".equals(segments[4])
                || !"records".equals(segments[6])
                || !segments[5].matches("[A-Za-z0-9_-]+")) {
            throw new IllegalArgumentException("HAR 中没有有效的飞书多维表格 records 接口");
        }
        String appToken = segments[5];
        Map<String, String> query = parseQuery(records.getRawQuery());
        String tableId = firstNonBlank(query.get("tableId"), query.get("tableID"));
        String viewId = firstNonBlank(query.get("viewId"), query.get("viewID"));
        String expectedTableId = parseQuery(source.getRawQuery()).getOrDefault("table", "");
        if (tableId == null || !tableId.matches("tbl[A-Za-z0-9_-]+")
                || (!expectedTableId.isBlank() && !expectedTableId.equals(tableId))) {
            throw new IllegalArgumentException("HAR records 请求与当前飞书表格的 tableId 不一致");
        }
        return new RecordsEndpoint(records, appToken, tableId, viewId == null ? "" : viewId);
    }

    private static URI buildPageUri(URI recordsUri, int offset) {
        List<String> parts = new ArrayList<>();
        String rawQuery = recordsUri.getRawQuery();
        if (rawQuery != null && !rawQuery.isBlank()) {
            for (String part : rawQuery.split("&")) {
                String name = part.contains("=") ? part.substring(0, part.indexOf('=')) : part;
                if (name.equalsIgnoreCase("offset")
                        || name.equalsIgnoreCase("limit")
                        || name.equalsIgnoreCase("tableRev")) {
                    continue;
                }
                parts.add(part);
            }
        }
        parts.add("offset=" + offset);
        parts.add("limit=" + PAGE_SIZE);
        String base = recordsUri.getScheme() + "://" + recordsUri.getRawAuthority() + recordsUri.getRawPath();
        return URI.create(base + "?" + String.join("&", parts));
    }

    private static String firstNonBlank(String first, String second) {
        return first != null && !first.isBlank() ? first : second;
    }

    private static boolean isTableDataResponse(String url) {
        String normalized = url.toLowerCase(Locale.ROOT);
        return normalized.contains("/records")
                || normalized.contains("/clientvars")
                || normalized.contains("/tables")
                || normalized.contains("/fields");
    }

    static String validateUrl(String rawUrl) {
        URI uri;
        try {
            uri = URI.create(rawUrl == null ? "" : rawUrl.trim());
        } catch (Exception e) {
            throw new IllegalArgumentException("飞书链接格式无效");
        }
        String host = uri.getHost();
        if (!"https".equalsIgnoreCase(uri.getScheme())
                || host == null
                || !(host.equals("feishu.cn") || host.endsWith(".feishu.cn"))) {
            throw new IllegalArgumentException("仅支持 https://*.feishu.cn 的飞书链接");
        }
        String path = uri.getPath() == null ? "" : uri.getPath();
        if (!path.startsWith("/wiki/") && !path.startsWith("/base/")) {
            throw new IllegalArgumentException("仅支持飞书知识库或多维表格链接");
        }
        String tableId = parseQuery(uri.getRawQuery()).get("table");
        if (tableId == null || !tableId.matches("tbl[A-Za-z0-9_-]+")) {
            throw new IllegalArgumentException("链接中缺少有效的 table 参数");
        }
        return uri.toString();
    }

    List<RequirementRow> extractRows(List<String> responseBodies) {
        List<JsonNode> roots = new ArrayList<>();
        Map<String, String> fieldNames = new LinkedHashMap<>();
        for (String body : responseBodies) {
            try {
                JsonNode root = objectMapper.readTree(body);
                roots.add(root);
                JsonNode compressedRecords = decodeCompressedRecords(root);
                if (compressedRecords != null) roots.add(compressedRecords);
                collectFieldNames(root, fieldNames, 0);
                collectFieldNames(compressedRecords, fieldNames, 0);
            } catch (Exception ignored) {
                // 页面会并行返回多种 JSON；单个候选解析失败不影响其它响应。
            }
        }

        Map<String, RequirementRow> deduplicated = new LinkedHashMap<>();
        for (JsonNode root : roots) {
            collectRecordMap(root, fieldNames, deduplicated, 0);
            collectRecords(root, "", fieldNames, deduplicated, 0);
            if (deduplicated.size() >= MAX_RECORDS) break;
        }
        return deduplicated.values().stream().limit(MAX_RECORDS).toList();
    }

    /**
     * 飞书网页端 records 接口把记录 JSON 以 Base64 + Gzip 放在 data.records 中。
     * encoding 的具体枚举会随前端版本变化，因此以 Gzip 魔数判断，而不依赖枚举值。
     */
    private JsonNode decodeCompressedRecords(JsonNode root) {
        JsonNode encoded = root.path("data").path("records");
        if (!encoded.isTextual() || encoded.asText().isBlank()) return null;
        try {
            byte[] compressed = Base64.getDecoder().decode(encoded.asText());
            if (compressed.length < 2
                    || compressed[0] != (byte) 0x1f
                    || compressed[1] != (byte) 0x8b) {
                return null;
            }
            try (GZIPInputStream gzip = new GZIPInputStream(new ByteArrayInputStream(compressed));
                 ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                gzip.transferTo(output);
                return objectMapper.readTree(output.toByteArray());
            }
        } catch (Exception ignored) {
            return null;
        }
    }

    private static void collectRecordMap(
            JsonNode node,
            Map<String, String> fieldNames,
            Map<String, RequirementRow> output,
            int depth) {
        if (node == null || depth > 24 || output.size() >= MAX_RECORDS) return;
        if (node.isObject()) {
            JsonNode recordMap = firstNode(node, "recordMap", "record_map");
            if (recordMap != null && recordMap.isObject()) {
                Iterator<Map.Entry<String, JsonNode>> records = recordMap.fields();
                while (records.hasNext() && output.size() < MAX_RECORDS) {
                    Map.Entry<String, JsonNode> record = records.next();
                    if (!record.getKey().matches("rec[A-Za-z0-9_-]+") || !record.getValue().isObject()) {
                        continue;
                    }
                    Map<String, String> fields = extractDirectFieldMap(record.getValue(), fieldNames);
                    if (!fields.isEmpty()) {
                        output.put(record.getKey(), new RequirementRow(
                                record.getKey(), inferTitle(fields, record.getKey()), fields));
                    }
                }
            }
            node.elements().forEachRemaining(child ->
                    collectRecordMap(child, fieldNames, output, depth + 1));
        } else if (node.isArray()) {
            node.elements().forEachRemaining(child ->
                    collectRecordMap(child, fieldNames, output, depth + 1));
        }
    }

    private static void collectFieldNames(JsonNode node, Map<String, String> fieldNames, int depth) {
        if (node == null || depth > 24) return;
        if (node.isObject()) {
            String id = firstText(node, "field_id", "fieldId");
            String name = firstText(node, "field_name", "fieldName", "name", "title");
            if (!id.isBlank() && !name.isBlank() && !id.equals(name)) fieldNames.putIfAbsent(id, name);
            node.elements().forEachRemaining(child -> collectFieldNames(child, fieldNames, depth + 1));
        } else if (node.isArray()) {
            node.elements().forEachRemaining(child -> collectFieldNames(child, fieldNames, depth + 1));
        }
    }

    private static void collectRecords(
            JsonNode node,
            String parentKey,
            Map<String, String> fieldNames,
            Map<String, RequirementRow> output,
            int depth) {
        if (node == null || depth > 24 || output.size() >= MAX_RECORDS) return;
        if (node.isObject()) {
            String recordId = firstText(node, "record_id", "recordId");
            if (recordId.isBlank() && RECORD_CONTAINERS.contains(parentKey.toLowerCase(Locale.ROOT))) {
                recordId = firstText(node, "id");
            }
            if (recordId.matches("rec[A-Za-z0-9_-]+")) {
                Map<String, String> fields = extractFields(node, fieldNames);
                if (!fields.isEmpty()) {
                    RequirementRow candidate = new RequirementRow(recordId, inferTitle(fields, recordId), fields);
                    RequirementRow current = output.get(recordId);
                    if (current == null || candidate.fields().size() > current.fields().size()) {
                        output.put(recordId, candidate);
                    }
                }
            }
            Iterator<Map.Entry<String, JsonNode>> entries = node.fields();
            while (entries.hasNext()) {
                Map.Entry<String, JsonNode> entry = entries.next();
                collectRecords(entry.getValue(), entry.getKey(), fieldNames, output, depth + 1);
            }
        } else if (node.isArray()) {
            for (JsonNode child : node) collectRecords(child, parentKey, fieldNames, output, depth + 1);
        }
    }

    private static Map<String, String> extractFields(JsonNode record, Map<String, String> fieldNames) {
        JsonNode container = null;
        for (String name : FIELD_CONTAINERS) {
            JsonNode candidate = record.get(name);
            if (candidate != null && candidate.isObject() && candidate.size() > 0) {
                container = candidate;
                break;
            }
        }
        Map<String, String> fields = new LinkedHashMap<>();
        if (container != null) {
            Iterator<Map.Entry<String, JsonNode>> entries = container.fields();
            while (entries.hasNext()) {
                Map.Entry<String, JsonNode> entry = entries.next();
                String key = fieldNames.getOrDefault(entry.getKey(), entry.getKey());
                String value = stringifyValue(entry.getValue());
                if (!value.isBlank()) fields.put(key, value);
            }
        }
        JsonNode cells = record.get("cells");
        if (cells != null && cells.isArray()) {
            for (JsonNode cell : cells) {
                String fieldId = firstText(cell, "field_id", "fieldId", "id");
                String key = fieldNames.getOrDefault(fieldId, firstText(cell, "field_name", "fieldName", "name"));
                String value = stringifyValue(firstNode(cell, "value", "data", "text"));
                if (!key.isBlank() && !value.isBlank()) fields.putIfAbsent(key, value);
            }
        }
        return fields;
    }

    private static Map<String, String> extractDirectFieldMap(
            JsonNode fieldMap, Map<String, String> fieldNames) {
        Map<String, String> fields = new LinkedHashMap<>();
        Iterator<Map.Entry<String, JsonNode>> entries = fieldMap.fields();
        while (entries.hasNext()) {
            Map.Entry<String, JsonNode> entry = entries.next();
            if (!entry.getKey().matches("fld[A-Za-z0-9_-]+")) continue;
            String key = fieldNames.getOrDefault(
                    entry.getKey(), KNOWN_REQUIREMENT_FIELDS.getOrDefault(entry.getKey(), entry.getKey()));
            JsonNode cell = entry.getValue();
            JsonNode value = cell != null && cell.isObject() && cell.has("value")
                    ? cell.get("value")
                    : cell;
            String text = stringifyValue(value);
            if ("fld2JgJuVL".equals(entry.getKey())) {
                text = KNOWN_REQUIREMENT_TYPE_OPTIONS.getOrDefault(text, text);
            }
            if (!text.isBlank()) fields.put(key, text);
        }
        return fields;
    }

    private static String inferTitle(Map<String, String> fields, String fallback) {
        for (String preferred : TITLE_FIELDS) {
            for (Map.Entry<String, String> field : fields.entrySet()) {
                if (field.getKey().equalsIgnoreCase(preferred) && !field.getValue().isBlank()) {
                    return truncate(field.getValue(), 120);
                }
            }
        }
        return fields.values().stream()
                .filter(value -> !value.isBlank())
                .findFirst()
                .map(value -> truncate(value, 120))
                .orElse(fallback);
    }

    private static String stringifyValue(JsonNode node) {
        if (node == null || node.isNull()) return "";
        if (node.isValueNode()) return truncate(node.asText().trim(), 2_000);
        LinkedHashSet<String> leaves = new LinkedHashSet<>();
        collectLeaves(node, leaves, 0);
        return truncate(String.join("；", leaves), 2_000);
    }

    private static void collectLeaves(JsonNode node, LinkedHashSet<String> leaves, int depth) {
        if (node == null || node.isNull() || depth > 8 || leaves.size() >= 30) return;
        if (node.isValueNode()) {
            String value = node.asText().trim();
            if (!value.isBlank()) leaves.add(value);
            return;
        }
        if (node.isObject()) {
            for (String preferred : List.of("text", "name", "value", "title", "link", "url")) {
                JsonNode value = node.get(preferred);
                if (value != null) collectLeaves(value, leaves, depth + 1);
            }
            if (!leaves.isEmpty()) return;
        }
        node.elements().forEachRemaining(child -> collectLeaves(child, leaves, depth + 1));
    }

    private static String firstText(JsonNode node, String... names) {
        JsonNode value = firstNode(node, names);
        return value != null && value.isValueNode() ? value.asText("").trim() : "";
    }

    private static JsonNode firstNode(JsonNode node, String... names) {
        if (node == null || !node.isObject()) return null;
        for (String name : names) {
            JsonNode value = node.get(name);
            if (value != null && !value.isNull()) return value;
        }
        return null;
    }

    private static String truncate(String value, int maxLength) {
        if (value.length() <= maxLength) return value;
        return value.substring(0, maxLength) + "…";
    }

    private static Map<String, String> parseQuery(String rawQuery) {
        Map<String, String> result = new LinkedHashMap<>();
        if (rawQuery == null || rawQuery.isBlank()) return result;
        for (String pair : rawQuery.split("&")) {
            int separator = pair.indexOf('=');
            if (separator <= 0) continue;
            result.put(pair.substring(0, separator), pair.substring(separator + 1));
        }
        return result;
    }

    public record PullResult(
            String sourceUrl,
            String appToken,
            String tableId,
            String viewId,
            int count,
            int pageCount,
            String syncMode,
            List<RequirementRow> records) {}

    record RecordsEndpoint(URI uri, String appToken, String tableId, String viewId) {}

    public record RequirementRow(String recordId, String title, Map<String, String> fields) {}
}
