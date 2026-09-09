package com.exceptioncoder.toolbox.procurement.service;

import com.exceptioncoder.toolbox.procurement.domain.ProcurementStore;
import org.springframework.stereotype.Service;
import java.net.URI;
import java.time.Instant;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import static com.exceptioncoder.toolbox.procurement.domain.ProcurementData.*;

/** 站点与规则管理的输入边界，不执行用户填写的规则文本。 */
@Service
public class ProcurementCatalogService {
    private static final Set<String> CATEGORIES = Set.of("KEYWORD", "NEGATIVE", "CONTEXT", "DICTIONARY");
    private final ProcurementStore store;

    public ProcurementCatalogService(ProcurementStore store) { this.store = store; }

    public Site saveSite(String id, Site input) {
        Site current = store.sites().stream().filter(s -> s.id().equals(id)).findFirst()
                .orElseThrow(() -> new IllegalArgumentException("站点不存在"));
        String url = input.listUrl() == null ? "" : input.listUrl().trim();
        if (!url.isEmpty()) { validateUrl(url, Set.of(current.host())); }
        Site saved = new Site(id, required(input.name(), 120), current.host(),
                Boolean.TRUE.equals(input.enabled()), url, limited(input.notes(), 4000));
        store.saveSite(saved);
        return saved;
    }

    public Rule saveRule(String id, Rule input) {
        if (!CATEGORIES.contains(input.category()) || !id.matches("[A-Za-z0-9_-]{1,80}")) {
            throw new IllegalArgumentException("规则类别或编号不合法");
        }
        Map<String, String> fields = input.fields();
        if (fields == null || fields.size() > 20 || fields.entrySet().stream().anyMatch(e ->
                e.getKey().isBlank() || e.getKey().length() > 100 || e.getValue() == null || e.getValue().length() > 2000)) {
            throw new IllegalArgumentException("规则最多 20 个字段，字段内容最多 2000 字");
        }
        if (store.rules().size() >= 1000 && store.rules().stream().noneMatch(r -> r.id().equals(id))) {
            throw new IllegalArgumentException("规则达到 1000 条上限，请先整理现有规则");
        }
        String name = required(input.name(), 300);
        Map<String, String> normalized = new java.util.LinkedHashMap<>(fields);
        String nameField = switch (input.category()) {
            case "KEYWORD" -> "原始关键词/表达";
            case "NEGATIVE" -> "反向词/表达";
            case "CONTEXT" -> "规则名称";
            default -> "名称";
        };
        if (normalized.containsKey(nameField)) { normalized.put(nameField, name); }
        Rule saved = new Rule(id, input.category(), name, Boolean.TRUE.equals(input.enabled()), normalized);
        store.saveRule(saved);
        return saved;
    }

    public Notice addNotice(String url, String title) {
        String normalized = validateUrl(url, store.sites().stream().map(Site::host).collect(java.util.stream.Collectors.toSet()));
        String host = URI.create(normalized).getHost();
        Site site = store.sites().stream().filter(s -> s.host().equals(host)).findFirst().orElseThrow();
        Notice notice = new Notice(UUID.randomUUID().toString(), site.id(), normalized,
                title == null || title.isBlank() ? normalized : required(title, 500),
                "PENDING", "PENDING", "", "", "", null, null, "", "{}", "{}", "{}", null,
                Instant.now().toString());
        if (!store.addNotice(notice)) { throw new IllegalArgumentException("该公告 URL 已登记，请在采集结果中查找"); }
        return notice;
    }

    public static String validateUrl(String url, Set<String> hosts) {
        URI uri;
        try { uri = URI.create(required(url, 2000)).normalize(); }
        catch (RuntimeException e) { throw new IllegalArgumentException("请输入有效的公告 URL", e); }
        if (!("https".equals(uri.getScheme()) || "http".equals(uri.getScheme()))
                || !hosts.contains(uri.getHost()) || uri.getUserInfo() != null
                || (uri.getPort() != -1 && uri.getPort() != 80 && uri.getPort() != 443)) {
            throw new IllegalArgumentException("仅允许 Excel 登记站点的 HTTP/HTTPS 公告地址");
        }
        String value = uri.toString();
        return uri.getFragment() == null ? value : value.substring(0, value.indexOf('#'));
    }

    private static String required(String value, int max) {
        if (value == null || value.isBlank() || value.length() > max) {
            throw new IllegalArgumentException("必填字段为空或超过 " + max + " 字符");
        }
        return value.trim();
    }

    private String limited(String value, int max) {
        if (value == null) { return ""; }
        if (value.length() > max) { throw new IllegalArgumentException("字段过长"); }
        return value;
    }
}
