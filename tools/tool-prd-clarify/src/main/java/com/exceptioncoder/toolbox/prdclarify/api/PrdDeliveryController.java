package com.exceptioncoder.toolbox.prdclarify.api;

import com.exceptioncoder.toolbox.common.auth.web.AuthContext;
import com.exceptioncoder.toolbox.common.auth.web.AuthPrincipal;
import com.exceptioncoder.toolbox.prdclarify.api.dto.DeliveryOverviewView;
import com.exceptioncoder.toolbox.prdclarify.api.dto.StartDeliveryVerificationRequest;
import com.exceptioncoder.toolbox.prdclarify.delivery.DeliveryOverviewService;
import com.exceptioncoder.toolbox.prdclarify.delivery.DeliveryVerificationService;
import com.exceptioncoder.toolbox.prdclarify.domain.DeliveryVerificationRun;
import org.springframework.http.ResponseEntity;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.Optional;

/**
 * AI 交付中心只读 API，将 PRD 事实来源投影为大看板数据。
 */
@RestController
@RequestMapping("/api/prd-clarify/delivery-overview")
public class PrdDeliveryController {

    private final DeliveryOverviewService deliveryOverviewService;
    private final DeliveryVerificationService deliveryVerificationService;

    public PrdDeliveryController(
            DeliveryOverviewService deliveryOverviewService,
            DeliveryVerificationService deliveryVerificationService) {
        this.deliveryOverviewService = deliveryOverviewService;
        this.deliveryVerificationService = deliveryVerificationService;
    }

    /**
     * 返回当前用户可见需求的交付概览。
     */
    @GetMapping
    public DeliveryOverviewView overview(
            @RequestParam(required = false) String project,
            @RequestParam(required = false) String module,
            @RequestParam(name = "q", required = false) String query) {
        Optional<AuthPrincipal> principal = AuthContext.current();
        boolean administrator = principal.isEmpty() || principal.get().hasAnyRole("ADMIN");
        Long userId = principal.map(AuthPrincipal::userId).orElse(null);
        return deliveryOverviewService.overview(administrator, userId, project, module, query);
    }

    /** 启动一条服务端白名单中的构建或测试验证命令。 */
    @PostMapping("/{sessionId}/verification-runs")
    public ResponseEntity<DeliveryOverviewView.VerificationRunView> startVerification(
            @PathVariable String sessionId,
            @RequestBody StartDeliveryVerificationRequest request) {
        Optional<AuthPrincipal> principal = AuthContext.current();
        boolean administrator = principal.isEmpty() || principal.get().hasAnyRole("ADMIN");
        Long userId = principal.map(AuthPrincipal::userId).orElse(null);
        DeliveryVerificationRun run;
        try {
            run = deliveryVerificationService.start(
                    sessionId,
                    request == null ? null : request.commandId(),
                    administrator,
                    userId);
        } catch (IllegalStateException exception) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, exception.getMessage(), exception);
        } catch (IllegalArgumentException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, exception.getMessage(), exception);
        }
        return ResponseEntity.accepted().body(toView(run, false));
    }

    private static DeliveryOverviewView.VerificationRunView toView(
            DeliveryVerificationRun run,
            boolean stale) {
        return new DeliveryOverviewView.VerificationRunView(
                run.id(), run.commandId(), run.gitHead(), run.status().name(), run.exitCode(),
                run.testCount(), run.outputSummary(), run.lastError(), run.startedAt(), run.finishedAt(), stale);
    }
}
