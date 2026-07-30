package com.exceptioncoder.toolbox.prdclarify.api;

import com.exceptioncoder.toolbox.common.auth.web.AuthContext;
import com.exceptioncoder.toolbox.common.auth.web.AuthPrincipal;
import com.exceptioncoder.toolbox.prdclarify.api.dto.DeliveryOverviewView;
import com.exceptioncoder.toolbox.prdclarify.delivery.DeliveryOverviewService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Optional;

/**
 * AI 交付中心只读 API，将 PRD 事实来源投影为大看板数据。
 */
@RestController
@RequestMapping("/api/prd-clarify/delivery-overview")
public class PrdDeliveryController {

    private final DeliveryOverviewService deliveryOverviewService;

    public PrdDeliveryController(DeliveryOverviewService deliveryOverviewService) {
        this.deliveryOverviewService = deliveryOverviewService;
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
}
