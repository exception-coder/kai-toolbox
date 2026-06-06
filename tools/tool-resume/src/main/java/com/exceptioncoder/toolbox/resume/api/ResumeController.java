package com.exceptioncoder.toolbox.resume.api;

import com.exceptioncoder.toolbox.common.auth.annotation.SoftGuard;
import com.exceptioncoder.toolbox.resume.api.dto.ResumeKvUpsertRequest;
import com.exceptioncoder.toolbox.resume.api.dto.ResumeKvView;
import com.exceptioncoder.toolbox.resume.service.ResumeStateService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 简历模块 REST 入口。
 *
 * <p>设计上保留两个独立 endpoint（state 与 jobTarget）：
 * <ul>
 *     <li>前端按 key 维度保存，避免一次写入互相覆盖</li>
 *     <li>JD 调优场景下只 PUT jobTarget，不需要带上整张简历 JSON</li>
 * </ul>
 */
@RestController
@RequestMapping("/api/resume")
@SoftGuard(allowReadonly = false)
public class ResumeController {

    private final ResumeStateService service;

    public ResumeController(ResumeStateService service) {
        this.service = service;
    }

    @GetMapping("/state")
    public ResumeKvView getState() {
        return service.getState().map(ResumeKvView::new).orElseGet(ResumeKvView::empty);
    }

    @PutMapping("/state")
    public ResumeKvView putState(@Valid @RequestBody ResumeKvUpsertRequest req) {
        service.saveState(req.valueJson());
        return new ResumeKvView(req.valueJson());
    }

    @GetMapping("/job-target")
    public ResumeKvView getJobTarget() {
        return service.getJobTarget().map(ResumeKvView::new).orElseGet(ResumeKvView::empty);
    }

    @PutMapping("/job-target")
    public ResumeKvView putJobTarget(@Valid @RequestBody ResumeKvUpsertRequest req) {
        service.saveJobTarget(req.valueJson());
        return new ResumeKvView(req.valueJson());
    }
}
