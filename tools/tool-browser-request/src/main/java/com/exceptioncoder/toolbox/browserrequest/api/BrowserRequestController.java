package com.exceptioncoder.toolbox.browserrequest.api;

import com.exceptioncoder.toolbox.browserrequest.api.dto.CreateSessionRequest;
import com.exceptioncoder.toolbox.browserrequest.api.dto.ExecuteRequestBody;
import com.exceptioncoder.toolbox.browserrequest.api.dto.SaveRequestBody;
import com.exceptioncoder.toolbox.browserrequest.config.BrowserSessionManager;
import com.exceptioncoder.toolbox.browserrequest.service.BrowserRequestService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

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
                body.curl(), body.method(), body.url(), body.headers(), body.body()));
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

    private BrowserRequestService.SaveCommand toCommand(SaveRequestBody b) {
        return new BrowserRequestService.SaveCommand(
                b.name(), b.curl(), b.method(), b.url(), b.headers(), b.body());
    }
}
