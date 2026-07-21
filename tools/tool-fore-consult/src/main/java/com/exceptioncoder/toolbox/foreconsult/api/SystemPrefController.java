package com.exceptioncoder.toolbox.foreconsult.api;

import com.exceptioncoder.toolbox.foreconsult.api.dto.SaveSystemPrefsRequest;
import com.exceptioncoder.toolbox.foreconsult.api.dto.SystemPrefView;
import com.exceptioncoder.toolbox.foreconsult.service.SystemPrefService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 业务系统展示偏好端点。路径前缀 {@code /api/fore-consult/system-prefs}。
 * 对工作台接口传来的项目做「别名 + 过滤 + 排序」的呈现层覆盖，与系统字典解耦。
 *
 * <ul>
 *   <li>{@code GET /api/fore-consult/system-prefs} — 全部偏好</li>
 *   <li>{@code PUT /api/fore-consult/system-prefs} — 批量保存（按项 upsert），返回最新全量</li>
 * </ul>
 */
@RestController
@RequestMapping("/api/fore-consult/system-prefs")
public class SystemPrefController {

    private final SystemPrefService service;

    public SystemPrefController(SystemPrefService service) {
        this.service = service;
    }

    @GetMapping
    public List<SystemPrefView> list() {
        return service.listAll().stream().map(SystemPrefView::from).toList();
    }

    @PutMapping
    public List<SystemPrefView> save(@Valid @RequestBody SaveSystemPrefsRequest req) {
        return service.save(req).stream().map(SystemPrefView::from).toList();
    }
}
