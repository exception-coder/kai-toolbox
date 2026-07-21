package com.exceptioncoder.toolbox.foreconsult.service;

import com.exceptioncoder.toolbox.foreconsult.api.dto.SaveSystemPrefsRequest;
import com.exceptioncoder.toolbox.foreconsult.domain.ConsultSystemPref;
import com.exceptioncoder.toolbox.foreconsult.repository.ConsultSystemPrefRepository;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * 业务系统展示偏好（别名 + 过滤 + 排序）的读写服务。呈现层覆盖，不含系统字典本身。
 */
@Service
public class SystemPrefService {

    private final ConsultSystemPrefRepository repo;

    public SystemPrefService(ConsultSystemPrefRepository repo) {
        this.repo = repo;
    }

    public List<ConsultSystemPref> listAll() {
        return repo.findAll();
    }

    /** 批量保存：按项 upsert。别名空白视为无别名（存 null，前端回退原名）。 */
    public List<ConsultSystemPref> save(SaveSystemPrefsRequest req) {
        long now = System.currentTimeMillis();
        List<SaveSystemPrefsRequest.Item> items = req.prefs() != null ? req.prefs() : List.of();
        for (SaveSystemPrefsRequest.Item item : items) {
            if (item.systemName() == null || item.systemName().isBlank()) {
                continue;
            }
            String alias = item.alias() != null && !item.alias().isBlank() ? item.alias().trim() : null;
            repo.upsert(ConsultSystemPref.builder()
                    .systemName(item.systemName().trim())
                    .systemSourcePath(item.systemSourcePath())
                    .alias(alias)
                    .visible(item.visible() == null || item.visible())
                    .sortOrder(item.sortOrder() != null ? item.sortOrder() : 0)
                    .updatedAt(now)
                    .build());
        }
        return repo.findAll();
    }
}
