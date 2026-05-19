package com.exceptioncoder.toolbox.browserrequest.api;

import com.exceptioncoder.toolbox.browserrequest.api.dto.CreateSessionRequest;
import com.exceptioncoder.toolbox.browserrequest.api.dto.ExecuteRequestBody;
import com.exceptioncoder.toolbox.browserrequest.api.dto.ExtractToSavedRequest;
import com.exceptioncoder.toolbox.browserrequest.api.dto.PipelineDtos;
import com.exceptioncoder.toolbox.browserrequest.api.dto.SaveRequestBody;
import com.exceptioncoder.toolbox.browserrequest.api.dto.UpsertVarRequest;
import com.exceptioncoder.toolbox.browserrequest.config.BrowserSessionManager;
import com.exceptioncoder.toolbox.browserrequest.service.BrowserRequestService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.List;

@RestController
@RequestMapping("/api/browser-request")
public class BrowserRequestController {

    private final BrowserRequestService service;

    public BrowserRequestController(BrowserRequestService service) {
        this.service = service;
    }

    @GetMapping("/sessions")
    public List<BrowserRequestService.SessionView> list() {
        return service.list();
    }

    @PostMapping("/sessions")
    public BrowserRequestService.SessionView create(@Valid @RequestBody CreateSessionRequest req) {
        return service.create(req.name(), req.url());
    }

    /** 打开/恢复浏览器窗口并导航。已打开则导航当前窗口到 url。 */
    @PostMapping("/sessions/{id}/open")
    public BrowserRequestService.SessionView open(@PathVariable String id) {
        return service.open(id);
    }

    /** 保存当前 BrowserContext 的 storage state 到磁盘（登录态持久化）。 */
    @PostMapping("/sessions/{id}/save")
    public BrowserRequestService.SessionView save(@PathVariable String id) {
        return service.saveStorage(id);
    }

    /** 清除磁盘上的 storage state（登出）。 */
    @PostMapping("/sessions/{id}/clear")
    public BrowserRequestService.SessionView clear(@PathVariable String id) {
        return service.clearStorage(id);
    }

    /** 关闭浏览器窗口（保留磁盘 storage）。 */
    @PostMapping("/sessions/{id}/close")
    public BrowserRequestService.SessionView close(@PathVariable String id) {
        return service.close(id);
    }

    @DeleteMapping("/sessions/{id}")
    public void delete(@PathVariable String id) {
        service.delete(id);
    }

    @PostMapping("/sessions/{id}/execute")
    public BrowserSessionManager.ExecutedResponse execute(@PathVariable String id,
                                                          @RequestBody ExecuteRequestBody body) {
        return service.execute(id, new BrowserRequestService.ExecuteCommand(
                body.curl(), body.method(), body.url(), body.headers(), body.body(),
                body.linkedSavedId()));
    }

    // ── JS 捕获 ──────────────────────────────────────────────────────────────

    @PostMapping("/sessions/{id}/capture/start")
    public BrowserRequestService.CaptureStatusView startCapture(@PathVariable String id) {
        return service.startCapture(id);
    }

    @PostMapping("/sessions/{id}/capture/stop")
    public BrowserRequestService.CaptureStatusView stopCapture(@PathVariable String id) {
        return service.stopCapture(id);
    }

    @GetMapping("/sessions/{id}/capture")
    public BrowserRequestService.CaptureStatusView captureStatus(@PathVariable String id) {
        return service.captureStatus(id);
    }

    // ── 收藏的请求 ───────────────────────────────────────────────────────────

    @GetMapping("/sessions/{id}/saved")
    public List<BrowserRequestService.SavedRequestView> listSaved(@PathVariable String id) {
        return service.listSaved(id);
    }

    @PostMapping("/sessions/{id}/saved")
    public BrowserRequestService.SavedRequestView createSaved(@PathVariable String id,
                                                              @RequestBody SaveRequestBody body) {
        return service.createSaved(id, toCommand(body));
    }

    @PutMapping("/saved/{savedId}")
    public BrowserRequestService.SavedRequestView updateSaved(@PathVariable String savedId,
                                                              @RequestBody SaveRequestBody body) {
        return service.updateSaved(savedId, toCommand(body));
    }

    @DeleteMapping("/saved/{savedId}")
    public void deleteSaved(@PathVariable String savedId) {
        service.deleteSaved(savedId);
    }

    /** 从响应中提取一个值，写入目标 saved 的 outputs 配置 + lastExtractedValues（追加或更新同名）。 */
    @PostMapping("/saved/{savedId}/extract")
    public BrowserRequestService.SavedRequestView extractToSaved(
            @PathVariable String savedId, @RequestBody ExtractToSavedRequest body) {
        return service.extractToSaved(savedId, body.name(), body.jsonPath(), body.responseBody());
    }

    private BrowserRequestService.SaveCommand toCommand(SaveRequestBody b) {
        return new BrowserRequestService.SaveCommand(
                b.name(), b.curl(), b.method(), b.url(), b.headers(), b.body(),
                b.outputs(), b.lastResponseBody());
    }

    // ── 变量池 ──────────────────────────────────────────────────────────────

    @GetMapping("/sessions/{id}/vars")
    public List<BrowserRequestService.VarView> listVars(@PathVariable String id) {
        return service.listVars(id);
    }

    @PutMapping("/sessions/{id}/vars/{name}")
    public BrowserRequestService.VarView upsertVar(@PathVariable String id,
                                                    @PathVariable String name,
                                                    @RequestBody UpsertVarRequest body) {
        return service.upsertVar(id, name, body.value());
    }

    @DeleteMapping("/sessions/{id}/vars/{name}")
    public void deleteVar(@PathVariable String id, @PathVariable String name) {
        service.deleteVar(id, name);
    }

    // ── Pipeline CRUD ──────────────────────────────────────────────────────

    @GetMapping("/sessions/{id}/pipelines")
    public List<BrowserRequestService.PipelineSummary> listPipelines(@PathVariable String id) {
        return service.listPipelines(id);
    }

    @GetMapping("/pipelines/{pid}")
    public BrowserRequestService.PipelineDetail getPipeline(@PathVariable String pid) {
        return service.getPipeline(pid);
    }

    @PostMapping("/sessions/{id}/pipelines")
    public BrowserRequestService.PipelineDetail createPipeline(
            @PathVariable String id, @RequestBody PipelineDtos.CreatePipelineRequest body) {
        return service.createPipeline(id, body.name(), body.steps());
    }

    @PutMapping("/pipelines/{pid}")
    public BrowserRequestService.PipelineDetail updatePipeline(
            @PathVariable String pid, @RequestBody PipelineDtos.UpdatePipelineRequest body) {
        return service.updatePipeline(pid, body.name(), body.steps());
    }

    @DeleteMapping("/pipelines/{pid}")
    public void deletePipeline(@PathVariable String pid) {
        service.deletePipeline(pid);
    }

    @PostMapping("/pipelines/{pid}/run")
    public SseEmitter runPipeline(
            @PathVariable String pid,
            @RequestParam(name = "dryRun", defaultValue = "false") boolean dryRun) {
        return service.runPipeline(pid, dryRun);
    }

    @GetMapping("/pipelines/{pid}/runs")
    public List<BrowserRequestService.PipelineRunSummary> listRuns(
            @PathVariable String pid,
            @RequestParam(defaultValue = "20") int limit) {
        return service.listRuns(pid, limit);
    }

    @GetMapping("/runs/{rid}")
    public BrowserRequestService.PipelineRunDetail getRun(@PathVariable String rid) {
        return service.getRun(rid);
    }
}
