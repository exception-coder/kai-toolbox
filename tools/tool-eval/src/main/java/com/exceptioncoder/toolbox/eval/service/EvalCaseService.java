package com.exceptioncoder.toolbox.eval.service;

import com.exceptioncoder.toolbox.common.eval.EvalSampleSource;
import com.exceptioncoder.toolbox.eval.api.dto.SaveCaseRequest;
import com.exceptioncoder.toolbox.eval.domain.EvalCase;
import com.exceptioncoder.toolbox.eval.repository.EvalCaseRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

import static org.springframework.http.HttpStatus.BAD_REQUEST;
import static org.springframework.http.HttpStatus.NOT_FOUND;

/** 黄金集用例管理。入库前强制校验 JSON 合法性——脏用例会让整轮 run 变成噪声。 */
@Slf4j
@Service
public class EvalCaseService {

    private final EvalCaseRepository repo;
    private final ObjectMapper mapper;
    private final Map<String, EvalSampleSource> sources;

    public EvalCaseService(EvalCaseRepository repo, ObjectMapper mapper, List<EvalSampleSource> sourceBeans) {
        this.repo = repo;
        this.mapper = mapper;
        this.sources = sourceBeans.stream().collect(
                Collectors.toMap(EvalSampleSource::id, Function.identity(), (a, b) -> a, LinkedHashMap::new));
    }

    /** 各来源当前有多少条样本、其中多少条还没纳入黄金集，供界面显示「N 条待纳入」。 */
    public List<SourceStat> listSources() {
        return sources.values().stream().map(s -> {
            List<EvalSampleSource.Sample> all = s.collect();
            long pending = all.stream()
                    .filter(x -> x.sourceRef() != null && !x.sourceRef().isBlank())
                    .filter(x -> !repo.existsBySourceRef(x.sourceRef()))
                    .count();
            return new SourceStat(s.id(), s.displayName(), s.scenario(), all.size(), (int) pending);
        }).toList();
    }

    /**
     * 从指定来源纳入样本，按 sourceRef 幂等——已纳入的原样跳过，不会覆盖你手工改过的用例。
     *
     * <p>整批同生共死：中途失败全部回滚，避免出现「导了一半」这种说不清纳入了多少的中间态。
     */
    @Transactional
    public HarvestResult harvest(String sourceId, String dataset) {
        EvalSampleSource source = sources.get(sourceId);
        if (source == null) {
            throw new ResponseStatusException(BAD_REQUEST,
                    "未知样本来源: " + sourceId + "，可用: " + sources.keySet());
        }
        String ds = dataset == null || dataset.isBlank() ? sourceId : dataset.trim();
        List<EvalSampleSource.Sample> samples = source.collect();
        int created = 0;
        for (EvalSampleSource.Sample s : samples) {
            if (s.sourceRef() == null || s.sourceRef().isBlank()) {
                throw new ResponseStatusException(BAD_REQUEST,
                        "样本来源 " + sourceId + " 返回了空 sourceRef，无法幂等去重");
            }
            if (repo.existsBySourceRef(s.sourceRef())) {
                continue;
            }
            create(new SaveCaseRequest(source.scenario(), ds, s.title(), s.inputJson(),
                    s.expectedJson(), null, s.tags(), s.sourceRef(), true));
            created++;
        }
        log.info("[eval] 从 {} 纳入 {} 条（共 {} 条样本）", sourceId, created, samples.size());
        return new HarvestResult(sourceId, ds, samples.size(), created, samples.size() - created);
    }

    /**
     * @param total   来源当前样本总数
     * @param pending 尚未纳入黄金集的条数
     */
    public record SourceStat(String id, String displayName, String scenario, int total, int pending) {
    }

    public record HarvestResult(String source, String dataset, int received, int created, int skipped) {
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

    /**
     * 批量导入，按 sourceRef 幂等跳过已存在项。
     *
     * <p>整批同生共死：Spring MVC 的 {@code @Valid} 不会下钻到 {@code List} 的元素，
     * 因此这里先逐条自校验再落库；任一条不合法则整批回滚，避免「导了一半 + 400」这种
     * 说不清导进去多少的中间态——回捞脚本重跑时会因此重复插入无 sourceRef 的行。
     */
    @Transactional
    public int importBatch(List<SaveCaseRequest> requests) {
        for (int i = 0; i < requests.size(); i++) {
            validateElement(requests.get(i), i);
        }
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

    /** 补上 {@code @Valid} 对 List 元素失效的那部分校验，错误信息带下标便于定位。 */
    private void validateElement(SaveCaseRequest req, int index) {
        if (req == null) {
            throw new ResponseStatusException(BAD_REQUEST, "第 " + index + " 条为空");
        }
        requireText(req.scenario(), 32, "scenario", index);
        requireText(req.dataset(), 100, "dataset", index);
        requireText(req.title(), 200, "title", index);
        if (req.sourceRef() != null && req.sourceRef().length() > 200) {
            throw new ResponseStatusException(BAD_REQUEST, "第 " + index + " 条 sourceRef 超长（>200）");
        }
    }

    private void requireText(String value, int maxLen, String field, int index) {
        if (value == null || value.isBlank()) {
            throw new ResponseStatusException(BAD_REQUEST, "第 " + index + " 条 " + field + " 不能为空");
        }
        if (value.length() > maxLen) {
            throw new ResponseStatusException(BAD_REQUEST,
                    "第 " + index + " 条 " + field + " 超长（>" + maxLen + "）");
        }
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
