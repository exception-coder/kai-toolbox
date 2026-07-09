package com.exceptioncoder.toolbox.ops.service;

import com.exceptioncoder.toolbox.ops.api.dto.SystemRequest;
import com.exceptioncoder.toolbox.ops.domain.OpsDatasource;
import com.exceptioncoder.toolbox.ops.domain.OpsSystem;
import com.exceptioncoder.toolbox.ops.repository.DatasourceRepository;
import com.exceptioncoder.toolbox.ops.repository.QueryHistoryRepository;
import com.exceptioncoder.toolbox.ops.repository.SystemRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
public class OpsSystemService {

    private final SystemRepository systems;
    private final DatasourceRepository datasources;
    private final QueryHistoryRepository histories;

    public OpsSystemService(SystemRepository systems, DatasourceRepository datasources,
                            QueryHistoryRepository histories) {
        this.systems = systems;
        this.datasources = datasources;
        this.histories = histories;
    }

    public List<OpsSystem> findAll() {
        return systems.findAll();
    }

    public OpsSystem findRequired(String id) {
        return systems.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("system not found: " + id));
    }

    public OpsSystem create(SystemRequest req) {
        long now = System.currentTimeMillis();
        OpsSystem s = OpsSystem.builder()
                .id(UUID.randomUUID().toString())
                .name(req.name().trim())
                .code(blankToNull(req.code()))
                .owner(blankToNull(req.owner()))
                .description(blankToNull(req.description()))
                .sortOrder(req.sortOrder() == null ? 0 : req.sortOrder())
                .createdAt(now)
                .updatedAt(now)
                .build();
        systems.insert(s);
        return s;
    }

    public OpsSystem update(String id, SystemRequest req) {
        OpsSystem existing = findRequired(id);
        existing.setName(req.name().trim());
        existing.setCode(blankToNull(req.code()));
        existing.setOwner(blankToNull(req.owner()));
        existing.setDescription(blankToNull(req.description()));
        existing.setSortOrder(req.sortOrder() == null ? existing.getSortOrder() : req.sortOrder());
        existing.setUpdatedAt(System.currentTimeMillis());
        systems.update(existing);
        return existing;
    }

    /** 删除系统时级联删除其下所有中间件实例及查询历史。 */
    @Transactional
    public void delete(String id) {
        for (OpsDatasource ds : datasources.findBySystem(id)) {
            histories.deleteByDatasource(ds.getId());
        }
        datasources.deleteBySystem(id);
        systems.deleteById(id);
    }

    private static String blankToNull(String v) {
        return v == null || v.isBlank() ? null : v.trim();
    }
}
