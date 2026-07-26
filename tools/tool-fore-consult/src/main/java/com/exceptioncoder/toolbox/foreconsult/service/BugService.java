package com.exceptioncoder.toolbox.foreconsult.service;

import com.exceptioncoder.toolbox.foreconsult.api.dto.RegisterBugRequest;
import com.exceptioncoder.toolbox.foreconsult.domain.ConsultBug;
import com.exceptioncoder.toolbox.foreconsult.domain.ConsultSession;
import com.exceptioncoder.toolbox.foreconsult.repository.ConsultBugRepository;
import com.exceptioncoder.toolbox.foreconsult.repository.ConsultSessionRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Set;
import java.util.UUID;

/**
 * BUG 自动登记体系服务：结构化留存 AI 判定的缺陷，去重累加，人工核实流转。
 */
@Service
public class BugService {

    private static final Logger log = LoggerFactory.getLogger(BugService.class);
    private static final Set<String> STATUSES = Set.of("NEW", "CONFIRMED", "DUPLICATE", "FIXED", "WONTFIX", "REJECTED");
    private static final Set<String> TYPES = Set.of("FUNCTION_BUG", "DATA_ISSUE", "CONFIG", "PERMISSION", "OTHER");
    private static final Set<String> SEVERITIES = Set.of("LOW", "MEDIUM", "HIGH", "CRITICAL");

    private final ConsultBugRepository bugRepo;
    private final ConsultSessionRepository sessionRepo;
    private final ObjectMapper mapper = new ObjectMapper();

    public BugService(ConsultBugRepository bugRepo, ConsultSessionRepository sessionRepo) {
        this.bugRepo = bugRepo;
        this.sessionRepo = sessionRepo;
    }

    /** 登记（带去重）：同键未终结单只累加出现次数，否则新建 NEW。 */
    public ConsultBug register(RegisterBugRequest req) {
        ConsultSession s = req.consultSessionId() == null ? null
                : sessionRepo.findById(req.consultSessionId()).orElse(null);

        String systemName = s != null ? s.getSystemName() : null;
        String module = req.module() != null && !req.module().isBlank() ? req.module().trim()
                : (s != null ? firstModule(s.getModuleNames()) : null);
        String title = req.title().trim();
        String dedupKey = normalizeKey(systemName, module, title);
        long now = System.currentTimeMillis();
        String evidence = toJson(req.evidence());
        String refs = toJson(req.refs());

        var existing = bugRepo.findOpenByDedupKey(dedupKey);
        if (existing.isPresent()) {
            bugRepo.bumpOccurrence(existing.get().getBugId(), req.answer(), evidence, now);
            return bugRepo.findById(existing.get().getBugId()).orElse(existing.get());
        }

        ConsultBug bug = ConsultBug.builder()
                .bugId(UUID.randomUUID().toString())
                .dedupKey(dedupKey)
                .consultSessionId(req.consultSessionId())
                .devSessionId(s != null ? s.getDevSessionId() : null)
                .systemName(systemName)
                .module(module)
                .role(s != null ? s.getRole() : null)
                .userId(s != null ? s.getUserId() : null)
                .title(title)
                .type(TYPES.contains(upper(req.type())) ? upper(req.type()) : "OTHER")
                .severity(SEVERITIES.contains(upper(req.severity())) ? upper(req.severity()) : "MEDIUM")
                .reproduce(req.reproduce())
                .expected(req.expected())
                .actual(req.actual())
                .suspectArea(req.suspectArea())
                .evidence(evidence)
                .question(req.question())
                .answer(req.answer())
                .aiConfidence(req.confidence())
                .refsJson(refs)
                .status("NEW")
                .occurrenceCount(1)
                .firstSeenAt(now)
                .lastSeenAt(now)
                .createdAt(now)
                .updatedAt(now)
                .build();
        bugRepo.insert(bug);
        return bug;
    }

    public List<ConsultBug> listRecent(int limit) {
        return bugRepo.findRecent(limit);
    }

    public ConsultBug updateStatus(String bugId, String status) {
        String st = upper(status);
        if (!STATUSES.contains(st)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "非法状态: " + status);
        }
        ConsultBug b = bugRepo.findById(bugId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "BUG 不存在: " + bugId));
        bugRepo.updateStatus(bugId, st, System.currentTimeMillis());
        b.setStatus(st);
        return b;
    }

    public void delete(String bugId) {
        bugRepo.delete(bugId);
    }

    private static String upper(String s) {
        return s == null ? null : s.trim().toUpperCase();
    }

    private static String normalizeKey(String system, String module, String title) {
        String t = title == null ? "" : title.toLowerCase().replaceAll("\\s+", " ").trim();
        return (system == null ? "" : system) + "|" + (module == null ? "" : module) + "|" + t;
    }

    private String firstModule(String moduleNamesJson) {
        if (moduleNamesJson == null || moduleNamesJson.isBlank()) return null;
        try {
            List<String> mods = mapper.readValue(moduleNamesJson, mapper.getTypeFactory().constructCollectionType(List.class, String.class));
            return mods == null || mods.isEmpty() ? null : mods.get(0);
        } catch (Exception e) {
            return null;
        }
    }

    private String toJson(List<String> list) {
        if (list == null || list.isEmpty()) return null;
        try {
            return mapper.writeValueAsString(list);
        } catch (Exception e) {
            log.warn("[fore-consult] bug 证据/引用序列化失败: {}", e.getMessage());
            return null;
        }
    }
}
