package com.exceptioncoder.toolbox.frp.api;

import com.exceptioncoder.toolbox.frp.api.dto.FrpTargetUpsertRequest;
import com.exceptioncoder.toolbox.frp.api.dto.FrpTargetView;
import com.exceptioncoder.toolbox.frp.api.dto.ReadConfigRequest;
import com.exceptioncoder.toolbox.frp.api.dto.ReadConfigResult;
import com.exceptioncoder.toolbox.frp.api.dto.ServiceActionRequest;
import com.exceptioncoder.toolbox.frp.api.dto.ServiceActionResult;
import com.exceptioncoder.toolbox.frp.api.dto.TestConnectionRequest;
import com.exceptioncoder.toolbox.frp.api.dto.TestConnectionResult;
import com.exceptioncoder.toolbox.frp.api.dto.WriteConfigRequest;
import com.exceptioncoder.toolbox.frp.api.dto.WriteConfigResult;
import com.exceptioncoder.toolbox.frp.domain.FrpMode;
import com.exceptioncoder.toolbox.frp.service.FrpService;
import com.exceptioncoder.toolbox.frp.service.FrpTargetService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/frp")
public class FrpController {

    private final FrpService service;
    private final FrpTargetService targets;

    public FrpController(FrpService service, FrpTargetService targets) {
        this.service = service;
        this.targets = targets;
    }

    /* -------- frp 操作 -------- */

    @PostMapping("/test")
    public TestConnectionResult test(@RequestBody TestConnectionRequest req) {
        return service.testConnection(req);
    }

    @PostMapping("/read")
    public ReadConfigResult read(@RequestBody ReadConfigRequest req) {
        return service.readConfig(req);
    }

    @PostMapping("/write")
    public WriteConfigResult write(@RequestBody WriteConfigRequest req) {
        return service.writeConfig(req);
    }

    @PostMapping("/service")
    public ServiceActionResult serviceAction(@RequestBody ServiceActionRequest req) {
        return service.serviceAction(req);
    }

    /* -------- (主机, 角色) 配置快照持久化 -------- */

    @GetMapping("/targets")
    public List<FrpTargetView> listTargets() {
        return targets.findAll().stream().map(FrpTargetView::from).toList();
    }

    @GetMapping("/targets/{hostId}")
    public List<FrpTargetView> listTargetsForHost(@PathVariable String hostId) {
        return targets.findByHostId(hostId).stream().map(FrpTargetView::from).toList();
    }

    @GetMapping("/targets/{hostId}/{mode}")
    public ResponseEntity<FrpTargetView> getTarget(@PathVariable String hostId,
                                                   @PathVariable String mode) {
        return targets.findByHostAndMode(hostId, parseMode(mode))
                .map(t -> ResponseEntity.ok(FrpTargetView.from(t)))
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @PutMapping("/targets/{hostId}/{mode}")
    public FrpTargetView upsertTarget(@PathVariable String hostId,
                                      @PathVariable String mode,
                                      @RequestBody FrpTargetUpsertRequest req) {
        return FrpTargetView.from(targets.upsert(hostId, parseMode(mode), req));
    }

    @DeleteMapping("/targets/{hostId}/{mode}")
    public ResponseEntity<Void> deleteTarget(@PathVariable String hostId,
                                             @PathVariable String mode) {
        targets.delete(hostId, parseMode(mode));
        return ResponseEntity.noContent().build();
    }

    private static FrpMode parseMode(String raw) {
        try {
            return FrpMode.valueOf(raw.toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("mode 必须是 FRPS 或 FRPC，当前: " + raw);
        }
    }
}
