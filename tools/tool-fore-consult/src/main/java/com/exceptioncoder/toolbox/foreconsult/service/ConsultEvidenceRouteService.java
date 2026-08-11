package com.exceptioncoder.toolbox.foreconsult.service;

import com.exceptioncoder.toolbox.foreconsult.api.dto.EvidenceRouteRequest;
import com.exceptioncoder.toolbox.foreconsult.domain.ConsultEvidenceRoute;
import com.exceptioncoder.toolbox.foreconsult.repository.ConsultEvidenceRouteRepository;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;

/** 数据归属管理与首问证据路由解析。 */
@Service
public class ConsultEvidenceRouteService {

    private static final TypeReference<List<ConsultEvidenceRoute>> ROUTES = new TypeReference<>() { };
    private static final Set<String> STATUSES = Set.of("DRAFT", "CONFIRMED", "DISABLED");
    private static final Set<String> SCHEMA_SOURCES = Set.of("ERP_STANDBY", "RUNTIME_METADATA", "NONE");

    private final ConsultEvidenceRouteRepository repository;
    private final ObjectMapper mapper;

    public ConsultEvidenceRouteService(ConsultEvidenceRouteRepository repository, ObjectMapper mapper) {
        this.repository = repository;
        this.mapper = mapper;
    }

    public List<ConsultEvidenceRoute> list() {
        return repository.findAll();
    }

    public ConsultEvidenceRoute create(EvidenceRouteRequest request) {
        return saveNew(request, "MANUAL", normalizeStatus(request.status(), "DRAFT"));
    }

    public ConsultEvidenceRoute update(String id, EvidenceRouteRequest request) {
        ConsultEvidenceRoute existing = required(id);
        ConsultEvidenceRoute normalized = normalized(request, existing.getSource(), existing.getCreatedAt(), id);
        repository.update(normalized);
        return normalized;
    }

    public void delete(String id) {
        ConsultEvidenceRoute existing = required(id);
        if ("CONFIRMED".equals(existing.getStatus())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "已确认的数据归属请先停用，再删除");
        }
        repository.delete(id);
    }

    public ConsultEvidenceRoute createDraftCandidate(EvidenceRouteRequest request) {
        EvidenceRouteRequest draft = new EvidenceRouteRequest(
                request.contextSystem(), request.moduleName(), request.businessObject(), request.keywords(),
                request.evidenceSystem(), request.schemaSource(), request.description(), request.evidenceRefs(), "DRAFT");
        ConsultEvidenceRoute normalized = normalized(draft, "TOPOLOGY_ANALYSIS", System.currentTimeMillis(), UUID.randomUUID().toString());
        return repository.findEquivalent(normalized.getContextSystem(), normalized.getModuleName(),
                        normalized.getBusinessObject(), normalized.getEvidenceSystem())
                .orElseGet(() -> {
                    repository.insert(normalized);
                    return normalized;
                });
    }

    public ConsultEvidenceRouteResolution resolve(String contextSystem, List<String> moduleNames, String question) {
        LinkedHashSet<String> allowed = new LinkedHashSet<>();
        String contextCanonical = canonicalSystem(contextSystem);
        if (contextCanonical != null) allowed.add(contextCanonical);

        List<String> normalizedModules = clean(moduleNames, 20, 240).stream()
                .map(value -> value.toLowerCase(Locale.ROOT)).toList();
        String normalizedQuestion = lower(question);
        List<ConsultEvidenceRoute> matched = new ArrayList<>();
        for (ConsultEvidenceRoute route : repository.findAll()) {
            if (!"CONFIRMED".equals(route.getStatus())
                    || !java.util.Objects.equals(contextCanonical, canonicalSystem(route.getContextSystem()))) continue;
            if (!matches(route, normalizedModules, normalizedQuestion)) continue;
            String evidenceCanonical = canonicalSystem(route.getEvidenceSystem());
            if (evidenceCanonical == null) continue;
            allowed.add(evidenceCanonical);
            matched.add(route);
        }

        String snapshot = write(matched);
        return new ConsultEvidenceRouteResolution(List.copyOf(allowed), snapshot, promptContext(contextSystem, matched), matched);
    }

    public String promptContextFromSnapshot(String contextSystem, String snapshot) {
        if (snapshot == null || snapshot.isBlank()) return promptContext(contextSystem, List.of());
        try {
            List<ConsultEvidenceRoute> routes = mapper.readValue(snapshot, ROUTES);
            return promptContext(contextSystem, routes == null ? List.of() : routes);
        } catch (Exception ignored) {
            return promptContext(contextSystem, List.of());
        }
    }

    public static String canonicalSystem(String raw) {
        String value = lower(raw).replace('\\', '/');
        int slash = value.lastIndexOf('/');
        if (slash >= 0) value = value.substring(slash + 1);
        return switch (value) {
            case "erp", "erp-system", "yoooni" -> "erp";
            case "srm", "srm-system" -> "srm";
            case "scm", "scm-system" -> "scm";
            default -> null;
        };
    }

    private ConsultEvidenceRoute saveNew(EvidenceRouteRequest request, String source, String status) {
        EvidenceRouteRequest withStatus = new EvidenceRouteRequest(
                request.contextSystem(), request.moduleName(), request.businessObject(), request.keywords(),
                request.evidenceSystem(), request.schemaSource(), request.description(), request.evidenceRefs(), status);
        long now = System.currentTimeMillis();
        ConsultEvidenceRoute route = normalized(withStatus, source, now, UUID.randomUUID().toString());
        repository.insert(route);
        return route;
    }

    private ConsultEvidenceRoute normalized(EvidenceRouteRequest request, String source, long createdAt, String id) {
        String context = requiredText(request.contextSystem(), "发起系统", 120);
        String evidence = requiredText(request.evidenceSystem(), "权威证据系统", 120);
        if (context.equalsIgnoreCase(evidence)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "发起系统和权威证据系统不能相同");
        }
        if (canonicalSystem(context) == null || canonicalSystem(evidence) == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "目前只支持 ERP、SRM、SCM 证据系统");
        }
        String businessObject = requiredText(request.businessObject(), "业务对象/指标", 240);
        String status = normalizeStatus(request.status(), "DRAFT");
        String schemaSource = normalizeSchemaSource(request.schemaSource());
        List<String> keywords = clean(request.keywords(), 20, 80);
        String module = trimToNull(request.moduleName(), 240);
        if (module == null && keywords.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "模块和触发关键词至少填写一项");
        }
        long now = System.currentTimeMillis();
        return ConsultEvidenceRoute.builder()
                .id(id).contextSystem(context).moduleName(module).businessObject(businessObject)
                .keywords(write(keywords)).evidenceSystem(evidence).schemaSource(schemaSource)
                .description(trimToNull(request.description(), 1000)).evidenceRefs(write(clean(request.evidenceRefs(), 20, 300)))
                .status(status).source(source == null ? "MANUAL" : source).createdAt(createdAt).updatedAt(now)
                .confirmedAt("CONFIRMED".equals(status) ? now : null).build();
    }

    private boolean matches(ConsultEvidenceRoute route, List<String> modules, String question) {
        String routeModule = lower(route.getModuleName());
        boolean moduleMatch = !routeModule.isBlank() && modules.stream()
                .anyMatch(module -> module.contains(routeModule) || routeModule.contains(module));
        boolean objectMatch = !lower(route.getBusinessObject()).isBlank()
                && question.contains(lower(route.getBusinessObject()));
        boolean keywordMatch = parseStrings(route.getKeywords()).stream()
                .map(ConsultEvidenceRouteService::lower).filter(value -> !value.isBlank())
                .anyMatch(question::contains);
        return moduleMatch || objectMatch || keywordMatch;
    }

    private String promptContext(String contextSystem, List<ConsultEvidenceRoute> routes) {
        if (routes.isEmpty()) {
            return "发起系统：" + contextSystem + "。本轮没有命中已确认的跨系统数据归属，只能使用发起系统证据；非权威来源查询为空不得表述为业务值为 0。";
        }
        StringBuilder out = new StringBuilder("发起系统：").append(contextSystem)
                .append("。以下为平台已人工确认的数据归属，允许作为本会话权威证据来源：\n");
        for (ConsultEvidenceRoute route : routes) {
            out.append("- ").append(route.getBusinessObject()).append("：权威系统=")
                    .append(route.getEvidenceSystem());
            if (route.getModuleName() != null) out.append("，模块=").append(route.getModuleName());
            if (route.getDescription() != null) out.append("，说明=").append(route.getDescription());
            out.append('\n');
        }
        out.append("只有完成权威系统查询后才能回答‘0/无数据’；所有运行数据结论必须标明来源系统。");
        return out.toString();
    }

    private ConsultEvidenceRoute required(String id) {
        return repository.findById(id).orElseThrow(
                () -> new ResponseStatusException(HttpStatus.NOT_FOUND, "数据归属不存在"));
    }

    private List<String> parseStrings(String json) {
        if (json == null || json.isBlank()) return List.of();
        try {
            return mapper.readValue(json, new TypeReference<List<String>>() { });
        } catch (Exception ignored) {
            return List.of();
        }
    }

    private String write(Object value) {
        try {
            return mapper.writeValueAsString(value);
        } catch (Exception error) {
            throw new IllegalStateException("数据归属 JSON 序列化失败", error);
        }
    }

    private static List<String> clean(List<String> values, int maxItems, int maxLength) {
        if (values == null) return List.of();
        return values.stream().filter(value -> value != null && !value.isBlank())
                .map(String::trim).map(value -> value.length() > maxLength ? value.substring(0, maxLength) : value)
                .distinct().limit(maxItems).toList();
    }

    private static String requiredText(String value, String label, int maxLength) {
        String normalized = trimToNull(value, maxLength);
        if (normalized == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, label + "不能为空");
        return normalized;
    }

    private static String trimToNull(String value, int maxLength) {
        if (value == null || value.isBlank()) return null;
        String normalized = value.trim();
        return normalized.length() > maxLength ? normalized.substring(0, maxLength) : normalized;
    }

    private static String normalizeStatus(String value, String fallback) {
        String normalized = value == null || value.isBlank() ? fallback : value.trim().toUpperCase(Locale.ROOT);
        if (!STATUSES.contains(normalized)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "非法数据归属状态");
        }
        return normalized;
    }

    private static String normalizeSchemaSource(String value) {
        String normalized = value == null || value.isBlank() ? "RUNTIME_METADATA" : value.trim().toUpperCase(Locale.ROOT);
        if (!SCHEMA_SOURCES.contains(normalized)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "非法 DDL/结构来源");
        }
        return normalized;
    }

    private static String lower(String value) {
        return value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
    }
}
