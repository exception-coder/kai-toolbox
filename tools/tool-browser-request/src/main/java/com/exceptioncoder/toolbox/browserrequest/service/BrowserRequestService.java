package com.exceptioncoder.toolbox.browserrequest.service;

import com.exceptioncoder.toolbox.browserrequest.api.dto.PipelineDtos;
import com.exceptioncoder.toolbox.browserrequest.config.BrowserSessionManager;
import com.exceptioncoder.toolbox.browserrequest.domain.BrowserSession;
import com.exceptioncoder.toolbox.browserrequest.domain.BrowserVar;
import com.exceptioncoder.toolbox.browserrequest.domain.Pipeline;
import com.exceptioncoder.toolbox.browserrequest.domain.PipelineRun;
import com.exceptioncoder.toolbox.browserrequest.domain.SavedRequest;
import com.exceptioncoder.toolbox.browserrequest.repository.BrowserSessionRepository;
import com.exceptioncoder.toolbox.browserrequest.repository.BrowserVarRepository;
import com.exceptioncoder.toolbox.browserrequest.repository.PipelineRepository;
import com.exceptioncoder.toolbox.browserrequest.repository.PipelineRunRepository;
import com.exceptioncoder.toolbox.browserrequest.repository.SavedRequestRepository;
import com.exceptioncoder.toolbox.common.sse.SseEmitterRegistry;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.nio.file.Files;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Slf4j
@Service
public class BrowserRequestService {

    private static final TypeReference<Map<String, String>> HEADERS_TYPE = new TypeReference<>() {};

    private final BrowserSessionRepository repo;
    private final SavedRequestRepository savedRepo;
    private final BrowserVarRepository varRepo;
    private final PipelineRepository pipelineRepo;
    private final PipelineRunRepository runRepo;
    private final BrowserSessionManager manager;
    private final ObjectMapper objectMapper;
    private final SseEmitterRegistry sseRegistry;
    private final PipelineExecutor pipelineExecutor;

    public BrowserRequestService(BrowserSessionRepository repo,
                                 SavedRequestRepository savedRepo,
                                 BrowserVarRepository varRepo,
                                 PipelineRepository pipelineRepo,
                                 PipelineRunRepository runRepo,
                                 BrowserSessionManager manager,
                                 ObjectMapper objectMapper,
                                 SseEmitterRegistry sseRegistry,
                                 PipelineExecutor pipelineExecutor) {
        this.repo = repo;
        this.savedRepo = savedRepo;
        this.varRepo = varRepo;
        this.pipelineRepo = pipelineRepo;
        this.runRepo = runRepo;
        this.manager = manager;
        this.objectMapper = objectMapper;
        this.sseRegistry = sseRegistry;
        this.pipelineExecutor = pipelineExecutor;
    }

    public List<SessionView> list() {
        return repo.findAll().stream()
                .map(s -> SessionView.from(s, manager.isActive(s.getId()), manager))
                .toList();
    }

    public SessionView create(String name, String url) {
        long now = System.currentTimeMillis();
        BrowserSession s = BrowserSession.builder()
                .id(UUID.randomUUID().toString())
                .name(name == null || name.isBlank() ? "未命名会话" : name.trim())
                .url(url)
                .hasStorage(false)
                .lastActiveAt(null)
                .createdAt(now)
                .updatedAt(now)
                .build();
        repo.insert(s);
        return SessionView.from(s, false, manager);
    }

    public SessionView open(String id) {
        BrowserSession s = repo.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("会话不存在: " + id));
        manager.openSession(s.getId(), s.getUrl());
        long now = System.currentTimeMillis();
        repo.touchActive(id, now);
        s.setLastActiveAt(now);
        s.setUpdatedAt(now);
        return SessionView.from(s, true, manager);
    }

    public SessionView saveStorage(String id) {
        BrowserSession s = repo.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("会话不存在: " + id));
        manager.saveStorageState(id);
        long now = System.currentTimeMillis();
        repo.markStorageSaved(id, true, now);
        s.setHasStorage(true);
        s.setUpdatedAt(now);
        return SessionView.from(s, manager.isActive(id), manager);
    }

    public SessionView clearStorage(String id) {
        BrowserSession s = repo.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("会话不存在: " + id));
        manager.clearStorageState(id);
        long now = System.currentTimeMillis();
        repo.markStorageSaved(id, false, now);
        s.setHasStorage(false);
        s.setUpdatedAt(now);
        return SessionView.from(s, manager.isActive(id), manager);
    }

    public SessionView close(String id) {
        BrowserSession s = repo.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("会话不存在: " + id));
        boolean savedBeforeClose = manager.closeSession(id);
        if (savedBeforeClose) {
            long now = System.currentTimeMillis();
            repo.markStorageSaved(id, true, now);
            s.setHasStorage(true);
            s.setUpdatedAt(now);
        }
        return SessionView.from(s, false, manager);
    }

    public void delete(String id) {
        manager.closeSession(id);
        manager.clearStorageState(id);
        // 同步删除会话目录（即使空目录残留也清干净）
        try {
            var dir = manager.storageStatePath(id).getParent();
            if (dir != null && Files.exists(dir)) {
                try (var s = Files.list(dir)) {
                    s.forEach(p -> { try { Files.deleteIfExists(p); } catch (Exception ignored) {} });
                }
                Files.deleteIfExists(dir);
            }
        } catch (Exception e) {
            log.warn("清理 session 目录失败 {}: {}", id, e.getMessage());
        }
        savedRepo.deleteBySession(id);
        varRepo.deleteAllForSession(id);
        runRepo.deleteBySession(id);
        pipelineRepo.deleteBySession(id);
        repo.deleteById(id);
    }

    // ── JS 捕获 ───────────────────────────────────────────────────────────────

    public CaptureStatusView startCapture(String sessionId) {
        repo.findById(sessionId).orElseThrow(() -> new IllegalArgumentException("会话不存在: " + sessionId));
        manager.startJsCapture(sessionId);
        return captureStatus(sessionId);
    }

    public CaptureStatusView stopCapture(String sessionId) {
        manager.stopJsCapture(sessionId);
        return captureStatus(sessionId);
    }

    public CaptureStatusView captureStatus(String sessionId) {
        return new CaptureStatusView(
                manager.isJsCaptureActive(sessionId),
                manager.jsCaptureCount(sessionId),
                manager.captureDir(sessionId).toAbsolutePath().toString());
    }

    public record CaptureStatusView(boolean active, int capturedCount, String directory) {}

    // ── 收藏的请求 ───────────────────────────────────────────────────────────

    public List<SavedRequestView> listSaved(String sessionId) {
        repo.findById(sessionId).orElseThrow(() -> new IllegalArgumentException("会话不存在: " + sessionId));
        return savedRepo.findBySession(sessionId).stream().map(this::toView).toList();
    }

    public SavedRequestView createSaved(String sessionId, SaveCommand cmd) {
        repo.findById(sessionId).orElseThrow(() -> new IllegalArgumentException("会话不存在: " + sessionId));
        // 没用 dup.savedId 是为了在新建场景 currentSavedId 传 null（不与任何 saved 比较自身）
        checkOutputNamesUnique(sessionId, null, cmd.outputs());
        java.util.Optional<SavedRequest> dup = findEquivalent(sessionId, cmd);
        long now = System.currentTimeMillis();
        String lastBody = truncateForStorage(emptyToNull(cmd.lastResponseBody()));
        Long lastAt = lastBody != null ? now : null;
        if (dup.isPresent()) {
            SavedRequest old = dup.get();
            log.info("[SavedRequest] 检测到等价请求，覆盖现有 id={} name={}", old.getId(), old.getName());
            old.setName(resolveName(cmd));
            old.setCurl(emptyToNull(cmd.curl()));
            old.setMethod(emptyToNull(cmd.method()));
            old.setUrl(emptyToNull(cmd.url()));
            old.setHeadersJson(serializeHeaders(cmd.headers()));
            old.setBody(emptyToNull(cmd.body()));
            old.setOutputsJson(serializeOutputs(cmd.outputs()));
            // 只在本次确实带了响应时覆盖；否则保留旧响应
            if (lastBody != null) {
                old.setLastResponseBody(lastBody);
                old.setLastResponseAt(lastAt);
            }
            old.setUpdatedAt(now);
            savedRepo.update(old);
            return toView(old);
        }
        SavedRequest r = SavedRequest.builder()
                .id(UUID.randomUUID().toString())
                .sessionId(sessionId)
                .name(resolveName(cmd))
                .curl(emptyToNull(cmd.curl()))
                .method(emptyToNull(cmd.method()))
                .url(emptyToNull(cmd.url()))
                .headersJson(serializeHeaders(cmd.headers()))
                .body(emptyToNull(cmd.body()))
                .outputsJson(serializeOutputs(cmd.outputs()))
                .lastResponseBody(lastBody)
                .lastResponseAt(lastAt)
                .createdAt(now)
                .updatedAt(now)
                .build();
        savedRepo.insert(r);
        return toView(r);
    }

    /** 响应体太大时截断；编排时 PathPicker 需要 parse 这段 JSON，所以上限拍宽 5MB，多数 API 完整保留。 */
    private static final int LAST_RESPONSE_MAX = 5 * 1024 * 1024;
    private static String truncateForStorage(String body) {
        if (body == null) return null;
        if (body.length() <= LAST_RESPONSE_MAX) return body;
        return body.substring(0, LAST_RESPONSE_MAX) + "\n[已截断 · 原始 " + body.length() + " 字符]";
    }

    /**
     * 查找与 cmd 等价的已存在请求（同 sessionId 下）。
     *   - 若 cmd 是 cURL 模式：比较整段 cURL 文本（trim 后）
     *   - 若 cmd 是结构化：比较 method + url + body 三者全等
     * headers / name / outputs 不参与去重——这些是元信息，相同请求不同名也应合并。
     */
    private java.util.Optional<SavedRequest> findEquivalent(String sessionId, SaveCommand cmd) {
        String cmdCurl = emptyToNull(cmd.curl());
        String cmdMethod = emptyToNull(cmd.method());
        String cmdUrl = emptyToNull(cmd.url());
        String cmdBody = emptyToNull(cmd.body());
        for (SavedRequest r : savedRepo.findBySession(sessionId)) {
            if (cmdCurl != null || r.getCurl() != null) {
                if (java.util.Objects.equals(normalize(cmdCurl), normalize(r.getCurl()))) {
                    return java.util.Optional.of(r);
                }
            } else if (java.util.Objects.equals(cmdMethod, r.getMethod())
                    && java.util.Objects.equals(cmdUrl, r.getUrl())
                    && java.util.Objects.equals(cmdBody, r.getBody())) {
                return java.util.Optional.of(r);
            }
        }
        return java.util.Optional.empty();
    }

    private static String normalize(String s) {
        if (s == null) return null;
        return s.trim();
    }

    public SavedRequestView updateSaved(String savedId, SaveCommand cmd) {
        SavedRequest r = savedRepo.findById(savedId)
                .orElseThrow(() -> new IllegalArgumentException("保存的请求不存在: " + savedId));
        checkOutputNamesUnique(r.getSessionId(), savedId, cmd.outputs());
        long now = System.currentTimeMillis();
        r.setName(resolveName(cmd));
        r.setCurl(emptyToNull(cmd.curl()));
        r.setMethod(emptyToNull(cmd.method()));
        r.setUrl(emptyToNull(cmd.url()));
        r.setHeadersJson(serializeHeaders(cmd.headers()));
        r.setBody(emptyToNull(cmd.body()));
        r.setOutputsJson(serializeOutputs(cmd.outputs()));
        String lastBody = truncateForStorage(emptyToNull(cmd.lastResponseBody()));
        if (lastBody != null) {
            r.setLastResponseBody(lastBody);
            r.setLastResponseAt(now);
        }
        r.setUpdatedAt(now);
        savedRepo.update(r);
        return toView(r);
    }

    /**
     * 校验 outputs 名字在同一 session 下跨 saved 唯一。
     * 同名变量会让模板渲染时不知道用谁的值，所以禁止。
     */
    private void checkOutputNamesUnique(String sessionId, String currentSavedId,
                                        List<PipelineDtos.OutputSpec> outputs) {
        if (outputs == null || outputs.isEmpty()) return;
        Map<String, String> nameToSaved = new LinkedHashMap<>();
        for (SavedRequest other : savedRepo.findBySession(sessionId)) {
            if (other.getId().equals(currentSavedId)) continue;
            List<PipelineDtos.OutputSpec> os = deserializeOutputs(other.getOutputsJson());
            for (PipelineDtos.OutputSpec o : os) {
                if (o.name() != null) nameToSaved.put(o.name(), other.getName());
            }
        }
        for (PipelineDtos.OutputSpec o : outputs) {
            if (o.name() != null && nameToSaved.containsKey(o.name())) {
                throw new IllegalArgumentException(
                        "变量名「" + o.name() + "」已被请求「" + nameToSaved.get(o.name())
                                + "」占用——同会话下变量名必须跨 saved 唯一");
            }
        }
    }

    /**
     * 从响应中提取一个字段值，作为目标 saved 的某个 output 写入。
     * 如果 output 不存在则新增（追加到 saved.outputs + 校验唯一）；存在则更新 jsonPath 并刷新值。
     */
    public SavedRequestView extractToSaved(String savedId, String name, String jsonPath, String responseBody) {
        SavedRequest r = savedRepo.findById(savedId)
                .orElseThrow(() -> new IllegalArgumentException("保存的请求不存在: " + savedId));
        if (name == null || name.isBlank() || !name.matches("[A-Za-z_][A-Za-z0-9_]*")) {
            throw new IllegalArgumentException("变量名只能含字母 / 数字 / 下划线，且不能以数字开头");
        }
        if (jsonPath == null || jsonPath.isBlank()) {
            throw new IllegalArgumentException("JSONPath 不能为空");
        }
        if (responseBody == null || responseBody.isBlank()) {
            throw new IllegalArgumentException("响应体为空，无法提取");
        }
        // 求值
        JsonNode v = SimpleJsonPath.eval(responseBody, jsonPath, objectMapper);
        if (v == null) {
            throw new IllegalArgumentException("JSONPath 求值为空（路径不存在）");
        }
        String value = SimpleJsonPath.stringify(v);

        // 更新 outputs 列表（追加或更新同名）
        List<PipelineDtos.OutputSpec> existing = new ArrayList<>(deserializeOutputs(r.getOutputsJson()));
        boolean found = false;
        for (int i = 0; i < existing.size(); i++) {
            if (name.equals(existing.get(i).name())) {
                existing.set(i, new PipelineDtos.OutputSpec(name, jsonPath, existing.get(i).persist()));
                found = true;
                break;
            }
        }
        if (!found) {
            existing.add(new PipelineDtos.OutputSpec(name, jsonPath, false));
            // 校验跨 saved 唯一（追加新名字时才需要）
            checkOutputNamesUnique(r.getSessionId(), savedId, List.of(existing.get(existing.size() - 1)));
        }

        // 更新 lastExtractedValues map
        Map<String, String> values = deserializeStringMap(r.getLastExtractedValuesJson());
        values.put(name, value);

        long now = System.currentTimeMillis();
        r.setOutputsJson(serializeOutputs(existing));
        r.setLastExtractedValuesJson(serializeStringMap(values));
        r.setUpdatedAt(now);
        savedRepo.update(r);
        log.info("[SavedRequest] extract → {}={} 写入 saved={}", name, value.length() > 60 ? value.substring(0, 60) + "…" : value, savedId);
        return toView(r);
    }

    public void deleteSaved(String savedId) {
        boolean ok = savedRepo.deleteById(savedId);
        log.info("[SavedRequest] delete id={} ok={}", savedId, ok);
        if (!ok) {
            throw new IllegalArgumentException("保存的请求不存在: " + savedId);
        }
    }

    private String resolveName(SaveCommand cmd) {
        if (cmd.name() != null && !cmd.name().isBlank()) return cmd.name().trim();
        if (cmd.url() != null && !cmd.url().isBlank()) {
            String m = cmd.method() == null ? "" : cmd.method().toUpperCase() + " ";
            return (m + cmd.url()).substring(0, Math.min(80, (m + cmd.url()).length()));
        }
        if (cmd.curl() != null && !cmd.curl().isBlank()) {
            return cmd.curl().strip().lines().findFirst().orElse("cURL")
                    .substring(0, Math.min(60, cmd.curl().strip().length()));
        }
        return "未命名请求";
    }

    private String emptyToNull(String s) {
        return (s == null || s.isEmpty()) ? null : s;
    }

    private String serializeHeaders(Map<String, String> headers) {
        if (headers == null || headers.isEmpty()) return null;
        try {
            return objectMapper.writeValueAsString(headers);
        } catch (Exception e) {
            log.warn("序列化 headers 失败: {}", e.getMessage());
            return null;
        }
    }

    private Map<String, String> deserializeHeaders(String json) {
        if (json == null || json.isBlank()) return new LinkedHashMap<>();
        try {
            return objectMapper.readValue(json, HEADERS_TYPE);
        } catch (Exception e) {
            log.warn("反序列化 headers 失败: {}", e.getMessage());
            return new LinkedHashMap<>();
        }
    }

    private SavedRequestView toView(SavedRequest r) {
        return new SavedRequestView(
                r.getId(), r.getSessionId(), r.getName(),
                r.getCurl(), r.getMethod(), r.getUrl(),
                deserializeHeaders(r.getHeadersJson()), r.getBody(),
                deserializeOutputs(r.getOutputsJson()),
                r.getLastResponseBody(), r.getLastResponseAt(),
                deserializeStringMap(r.getLastExtractedValuesJson()),
                r.getCreatedAt(), r.getUpdatedAt());
    }

    private static final TypeReference<Map<String, String>> STRING_MAP_TYPE = new TypeReference<>() {};

    private Map<String, String> deserializeStringMap(String json) {
        if (json == null || json.isBlank()) return new LinkedHashMap<>();
        try { return objectMapper.readValue(json, STRING_MAP_TYPE); }
        catch (Exception e) {
            log.warn("反序列化 lastExtractedValues 失败: {}", e.getMessage());
            return new LinkedHashMap<>();
        }
    }

    private String serializeStringMap(Map<String, String> m) {
        if (m == null || m.isEmpty()) return null;
        try { return objectMapper.writeValueAsString(m); }
        catch (Exception e) { log.warn("序列化 lastExtractedValues 失败: {}", e.getMessage()); return null; }
    }

    private String serializeOutputs(List<PipelineDtos.OutputSpec> outputs) {
        if (outputs == null || outputs.isEmpty()) return null;
        try { return objectMapper.writeValueAsString(outputs); }
        catch (Exception e) { log.warn("序列化 outputs 失败: {}", e.getMessage()); return null; }
    }

    private List<PipelineDtos.OutputSpec> deserializeOutputs(String json) {
        if (json == null || json.isBlank()) return List.of();
        try {
            return objectMapper.readValue(json,
                    objectMapper.getTypeFactory().constructCollectionType(List.class, PipelineDtos.OutputSpec.class));
        } catch (Exception e) {
            log.warn("反序列化 outputs 失败: {}", e.getMessage());
            return List.of();
        }
    }

    public record SaveCommand(String name, String curl, String method, String url,
                              Map<String, String> headers, String body,
                              List<PipelineDtos.OutputSpec> outputs,
                              String lastResponseBody) {}

    public record SavedRequestView(String id, String sessionId, String name,
                                   String curl, String method, String url,
                                   Map<String, String> headers, String body,
                                   List<PipelineDtos.OutputSpec> outputs,
                                   String lastResponseBody, Long lastResponseAt,
                                   Map<String, String> lastExtractedValues,
                                   long createdAt, long updatedAt) {}

    public BrowserSessionManager.ExecutedResponse execute(String id, ExecuteCommand cmd) {
        repo.findById(id).orElseThrow(() -> new IllegalArgumentException("会话不存在: " + id));
        Map<String, String> vars = varRepo.asMap(id);
        BrowserSessionManager.ExecuteRequest req = resolveRequest(cmd, vars);
        BrowserSessionManager.ExecutedResponse resp = manager.execute(id, req);
        repo.touchActive(id, System.currentTimeMillis());
        // 链接到某条 saved：把响应体写到那条 saved 的 lastResponseBody（截断后），便于编排时拿来作参考
        if (cmd.linkedSavedId() != null && !cmd.linkedSavedId().isBlank()) {
            try {
                savedRepo.findById(cmd.linkedSavedId()).ifPresent(saved -> {
                    String truncated = truncateForStorage(resp.body());
                    long now = System.currentTimeMillis();
                    saved.setLastResponseBody(truncated);
                    saved.setLastResponseAt(now);
                    saved.setUpdatedAt(now);
                    savedRepo.update(saved);
                    log.info("[execute] 把响应体写入 saved={}（{} 字节）",
                            saved.getId(), truncated == null ? 0 : truncated.length());
                });
            } catch (Exception e) {
                // 不影响主流程——执行已经完成，落 lastResponseBody 失败只是丢失参考样本
                log.warn("[execute] 写入 saved.lastResponseBody 失败: {}", e.getMessage());
            }
        }
        return resp;
    }

    /**
     * 把前端「raw json 或 curl」两种输入归一为 ExecuteRequest。
     * 同时应用变量模板：
     *   - cURL 模式：对整段文本做一次替换，再交给 CurlParser
     *     （caveat：变量值含 shell 元字符可能破坏引号配对——文档中已警告，建议用结构化模式存复杂值）
     *   - 结构化模式：url / 每个 header value / body 分别渲染
     */
    private BrowserSessionManager.ExecuteRequest resolveRequest(ExecuteCommand cmd, Map<String, String> vars) {
        if (cmd.curl() != null && !cmd.curl().isBlank()) {
            String rendered = TemplateRenderer.render(cmd.curl(), vars);
            CurlParser.ParsedCurl p = CurlParser.parse(rendered);
            return new BrowserSessionManager.ExecuteRequest(p.method(), p.url(), p.headers(), p.body());
        }
        if (cmd.url() == null || cmd.url().isBlank()) {
            throw new IllegalArgumentException("缺少 url");
        }
        String method = (cmd.method() == null || cmd.method().isBlank()) ? "GET" : cmd.method().toUpperCase();
        String url = TemplateRenderer.render(cmd.url(), vars);
        Map<String, String> headers = null;
        if (cmd.headers() != null) {
            headers = new LinkedHashMap<>();
            for (Map.Entry<String, String> e : cmd.headers().entrySet()) {
                headers.put(e.getKey(), TemplateRenderer.render(e.getValue(), vars));
            }
        }
        String body = TemplateRenderer.render(cmd.body(), vars);
        return new BrowserSessionManager.ExecuteRequest(method, url, headers, body);
    }

    public record ExecuteCommand(String curl, String method, String url,
                                 Map<String, String> headers, String body,
                                 String linkedSavedId) {}

    // ── 变量池 ────────────────────────────────────────────────────────────────

    public List<VarView> listVars(String sessionId) {
        repo.findById(sessionId).orElseThrow(() -> new IllegalArgumentException("会话不存在: " + sessionId));
        return varRepo.listBySession(sessionId).stream().map(VarView::from).toList();
    }

    public VarView upsertVar(String sessionId, String name, String value) {
        repo.findById(sessionId).orElseThrow(() -> new IllegalArgumentException("会话不存在: " + sessionId));
        if (name == null || name.isBlank()) throw new IllegalArgumentException("变量名不能为空");
        if (!name.matches("[A-Za-z_][A-Za-z0-9_]*")) {
            throw new IllegalArgumentException("变量名只能包含字母、数字、下划线，且不能以数字开头：" + name);
        }
        long now = System.currentTimeMillis();
        varRepo.upsert(sessionId, name, value == null ? "" : value, now);
        return new VarView(name, value == null ? "" : value, now);
    }

    public void deleteVar(String sessionId, String name) {
        varRepo.delete(sessionId, name);
    }

    public record VarView(String name, String value, long updatedAt) {
        public static VarView from(BrowserVar v) {
            return new VarView(v.getName(), v.getValue(), v.getUpdatedAt());
        }
    }

    // ── Pipeline CRUD ────────────────────────────────────────────────────────

    /** 列表（不含 steps 详情，节省带宽）。 */
    public List<PipelineSummary> listPipelines(String sessionId) {
        return pipelineRepo.listBySession(sessionId).stream().map(p ->
                new PipelineSummary(p.getId(), p.getSessionId(), p.getName(),
                        countSteps(p.getStepsJson()), p.getCreatedAt(), p.getUpdatedAt())
        ).toList();
    }

    /** 详情含完整 steps。 */
    public PipelineDetail getPipeline(String id) {
        Pipeline p = pipelineRepo.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("pipeline 不存在: " + id));
        List<PipelineDtos.StepDto> steps = parseSteps(p.getStepsJson());
        return new PipelineDetail(p.getId(), p.getSessionId(), p.getName(), steps,
                p.getCreatedAt(), p.getUpdatedAt());
    }

    public PipelineDetail createPipeline(String sessionId, String name, List<PipelineDtos.StepDto> steps) {
        repo.findById(sessionId).orElseThrow(() -> new IllegalArgumentException("会话不存在: " + sessionId));
        validatePipelineInput(name, steps);
        long now = System.currentTimeMillis();
        String stepsJson = serializeSteps(steps);
        Pipeline p = Pipeline.builder()
                .id(UUID.randomUUID().toString())
                .sessionId(sessionId)
                .name(name.trim())
                .stepsJson(stepsJson)
                .createdAt(now).updatedAt(now)
                .build();
        pipelineRepo.insert(p);
        return new PipelineDetail(p.getId(), sessionId, p.getName(), steps, now, now);
    }

    public PipelineDetail updatePipeline(String id, String name, List<PipelineDtos.StepDto> steps) {
        Pipeline existing = pipelineRepo.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("pipeline 不存在: " + id));
        validatePipelineInput(name, steps);
        long now = System.currentTimeMillis();
        String stepsJson = serializeSteps(steps);
        pipelineRepo.update(id, name.trim(), stepsJson, now);
        return new PipelineDetail(id, existing.getSessionId(), name.trim(), steps, existing.getCreatedAt(), now);
    }

    public void deletePipeline(String id) {
        runRepo.deleteByPipeline(id);
        pipelineRepo.deleteById(id);
    }

    /** 启动 pipeline 运行；返回 SseEmitter 流式回前端。 */
    public SseEmitter runPipeline(String pipelineId, boolean dryRun) {
        Pipeline p = pipelineRepo.findById(pipelineId)
                .orElseThrow(() -> new IllegalArgumentException("pipeline 不存在: " + pipelineId));
        List<PipelineDtos.StepDto> steps = parseSteps(p.getStepsJson());
        String taskId = UUID.randomUUID().toString();
        String runId = UUID.randomUUID().toString();
        long startedAt = System.currentTimeMillis();
        // 先插一行 status=running，executor 跑完会 update 终态
        runRepo.insert(PipelineRun.builder()
                .id(runId)
                .pipelineId(pipelineId)
                .sessionId(p.getSessionId())
                .startedAt(startedAt)
                .status("running")
                .dryRun(dryRun)
                .build());
        SseEmitter emitter = sseRegistry.create(taskId);
        Thread.ofVirtual().name("pipeline-" + taskId).start(() ->
                pipelineExecutor.run(taskId, runId, p, steps, dryRun));
        return emitter;
    }

    public List<PipelineRunSummary> listRuns(String pipelineId, int limit) {
        return runRepo.listRecent(pipelineId, limit).stream()
                .map(r -> PipelineRunSummary.from(r, objectMapper)).toList();
    }

    public PipelineRunDetail getRun(String runId) {
        PipelineRun r = runRepo.findById(runId)
                .orElseThrow(() -> new IllegalArgumentException("run 不存在: " + runId));
        return PipelineRunDetail.from(r, objectMapper);
    }

    public record PipelineRunSummary(String id, String pipelineId, long startedAt, Long finishedAt,
                                     String status, boolean dryRun, JsonNode summary) {
        public static PipelineRunSummary from(PipelineRun r, ObjectMapper mapper) {
            JsonNode summary = null;
            if (r.getSummaryJson() != null && !r.getSummaryJson().isEmpty()) {
                try { summary = mapper.readTree(r.getSummaryJson()); } catch (Exception ignored) {}
            }
            return new PipelineRunSummary(r.getId(), r.getPipelineId(),
                    r.getStartedAt(), r.getFinishedAt(), r.getStatus(), r.isDryRun(),
                    summary);
        }
    }

    public record PipelineRunDetail(String id, String pipelineId, long startedAt, Long finishedAt,
                                    String status, boolean dryRun, JsonNode summary, JsonNode failures) {
        public static PipelineRunDetail from(PipelineRun r, ObjectMapper mapper) {
            JsonNode summary = parseJson(r.getSummaryJson(), mapper);
            JsonNode failures = parseJson(r.getFailuresJson(), mapper);
            return new PipelineRunDetail(r.getId(), r.getPipelineId(),
                    r.getStartedAt(), r.getFinishedAt(), r.getStatus(), r.isDryRun(),
                    summary, failures);
        }
        private static JsonNode parseJson(String s, ObjectMapper m) {
            if (s == null || s.isEmpty()) return null;
            try { return m.readTree(s); } catch (Exception e) { return null; }
        }
    }

    private void validatePipelineInput(String name, List<PipelineDtos.StepDto> steps) {
        if (name == null || name.isBlank()) throw new IllegalArgumentException("pipeline 名称不能为空");
        if (steps == null || steps.isEmpty()) throw new IllegalArgumentException("pipeline 至少需要 1 个 step");
        for (PipelineDtos.StepDto s : steps) {
            if (s.id() == null || s.id().isBlank()) throw new IllegalArgumentException("step.id 不能为空");
            if (!"single".equals(s.type()) && !"foreach".equals(s.type())) {
                throw new IllegalArgumentException("step.type 必须是 single 或 foreach，收到: " + s.type());
            }
            if (s.request() == null) throw new IllegalArgumentException("step.request 缺失");
            if ("foreach".equals(s.type()) && (s.source() == null || s.source().varName() == null
                    || s.source().varName().isBlank())) {
                throw new IllegalArgumentException("foreach step 缺少 source.varName");
            }
        }
    }

    private String serializeSteps(List<PipelineDtos.StepDto> steps) {
        try { return objectMapper.writeValueAsString(steps); }
        catch (Exception e) { throw new RuntimeException("steps 序列化失败: " + e.getMessage(), e); }
    }

    private List<PipelineDtos.StepDto> parseSteps(String stepsJson) {
        try {
            return objectMapper.readValue(stepsJson,
                    objectMapper.getTypeFactory().constructCollectionType(List.class, PipelineDtos.StepDto.class));
        } catch (Exception e) {
            throw new RuntimeException("steps 反序列化失败: " + e.getMessage(), e);
        }
    }

    private int countSteps(String stepsJson) {
        try {
            JsonNode arr = objectMapper.readTree(stepsJson);
            return arr.isArray() ? arr.size() : 0;
        } catch (Exception e) { return 0; }
    }

    public record PipelineSummary(String id, String sessionId, String name, int stepCount,
                                  long createdAt, long updatedAt) {}

    public record PipelineDetail(String id, String sessionId, String name,
                                 List<PipelineDtos.StepDto> steps,
                                 long createdAt, long updatedAt) {}

    public record SessionView(String id, String name, String url, boolean active,
                              boolean hasStorage, Long lastActiveAt, long createdAt, long updatedAt,
                              Long storageBytes, Long storageSavedAt) {
        public static SessionView from(BrowserSession s, boolean active, BrowserSessionManager manager) {
            return new SessionView(s.getId(), s.getName(), s.getUrl(), active,
                    s.isHasStorage(), s.getLastActiveAt(), s.getCreatedAt(), s.getUpdatedAt(),
                    manager.storageStateSize(s.getId()),
                    manager.storageStateModified(s.getId()));
        }
    }
}
