package com.exceptioncoder.toolbox.eval.service;

import com.exceptioncoder.toolbox.eval.api.dto.SaveCaseRequest;
import com.exceptioncoder.toolbox.eval.domain.EvalCase;
import com.exceptioncoder.toolbox.eval.repository.EvalCaseRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.UUID;

import static org.springframework.http.HttpStatus.BAD_REQUEST;
import static org.springframework.http.HttpStatus.NOT_FOUND;

/** 黄金集用例管理。入库前强制校验 JSON 合法性——脏用例会让整轮 run 变成噪声。 */
@Slf4j
@Service
public class EvalCaseService {

    private final EvalCaseRepository repo;
    private final ObjectMapper mapper;

    public EvalCaseService(EvalCaseRepository repo, ObjectMapper mapper) {
        this.repo = repo;
        this.mapper = mapper;
    }

    public EvalCase create(SaveCaseRequest req) {
        validateJson(req.inputJson(), "inputJson");
        validateJson(req.expectedJson(), "expectedJson");
        if (req.assertJson() != null && !req.assertJson().isBlank()) {
            validateJson(req.assertJson(), "assertJson");
        }
        long now = System.currentTimeMillis();
        EvalCase c = EvalCase.builder()
                .id(UUID.randomUUID().toString())
                .scenario(req.scenario())
                .dataset(req.dataset())
                .title(req.title())
                .inputJson(req.inputJson())
                .expectedJson(req.expectedJson())
                .assertJson(req.assertJson())
                .tags(req.tags())
                .sourceRef(req.sourceRef())
                .enabled(req.enabled() == null || req.enabled())
                .createdAt(now)
                .updatedAt(now)
                .build();
        repo.insert(c);
        return c;
    }

    public EvalCase update(String id, SaveCaseRequest req) {
        EvalCase existing = repo.findById(id)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "用例不存在: " + id));
        validateJson(req.inputJson(), "inputJson");
        validateJson(req.expectedJson(), "expectedJson");
        if (req.assertJson() != null && !req.assertJson().isBlank()) {
            validateJson(req.assertJson(), "assertJson");
        }
        existing.setScenario(req.scenario());
        existing.setDataset(req.dataset());
        existing.setTitle(req.title());
        existing.setInputJson(req.inputJson());
        existing.setExpectedJson(req.expectedJson());
        existing.setAssertJson(req.assertJson());
        existing.setTags(req.tags());
        existing.setSourceRef(req.sourceRef());
        existing.setEnabled(req.enabled() == null || req.enabled());
        existing.setUpdatedAt(System.currentTimeMillis());
        repo.update(existing);
        return existing;
    }

    public List<EvalCase> search(String scenario, String dataset) {
        return repo.search(scenario, dataset);
    }

    public EvalCase get(String id) {
        return repo.findById(id).orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "用例不存在: " + id));
    }

    public List<EvalCaseRepository.DatasetStat> listDatasets() {
        return repo.listDatasets();
    }

    public void delete(String id) {
        repo.delete(id);
    }

    /** 批量导入，按 sourceRef 幂等跳过已存在项。 */
    public int importBatch(List<SaveCaseRequest> requests) {
        int created = 0;
        for (SaveCaseRequest req : requests) {
            if (req.sourceRef() != null && !req.sourceRef().isBlank() && repo.existsBySourceRef(req.sourceRef())) {
                continue;
            }
            create(req);
            created++;
        }
        return created;
    }

    private void validateJson(String raw, String field) {
        if (raw == null || raw.isBlank()) {
            throw new ResponseStatusException(BAD_REQUEST, field + " 不能为空");
        }
        try {
            mapper.readTree(raw);
        } catch (Exception e) {
            throw new ResponseStatusException(BAD_REQUEST, field + " 不是合法 JSON: " + e.getMessage());
        }
    }
}
