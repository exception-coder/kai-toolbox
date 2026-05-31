package com.exceptioncoder.toolbox.frp.service;

import com.exceptioncoder.toolbox.frp.api.dto.FrpTargetUpsertRequest;
import com.exceptioncoder.toolbox.frp.domain.FrpHostTarget;
import com.exceptioncoder.toolbox.frp.domain.FrpMode;
import com.exceptioncoder.toolbox.frp.repository.FrpTargetRepository;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Optional;

/** frp (主机, 角色) 配置快照的存取。每个 (hostId, mode) 是一条独立记录。 */
@Service
public class FrpTargetService {

    private final FrpTargetRepository repo;

    public FrpTargetService(FrpTargetRepository repo) {
        this.repo = repo;
    }

    public List<FrpHostTarget> findAll() {
        return repo.findAll();
    }

    public Optional<FrpHostTarget> findByHostAndMode(String hostId, FrpMode mode) {
        return repo.findByHostAndMode(hostId, mode);
    }

    public List<FrpHostTarget> findByHostId(String hostId) {
        return repo.findByHostId(hostId);
    }

    public FrpHostTarget upsert(String hostId, FrpMode mode, FrpTargetUpsertRequest req) {
        if (hostId == null || hostId.isBlank()) {
            throw new IllegalArgumentException("hostId 不能为空");
        }
        if (mode == null) {
            throw new IllegalArgumentException("mode 不能为空 (FRPS / FRPC)");
        }
        if (req.installDir() == null || req.installDir().isBlank()) {
            throw new IllegalArgumentException("installDir 不能为空");
        }
        FrpHostTarget t = FrpHostTarget.builder()
                .hostId(hostId)
                .mode(mode)
                .installDir(req.installDir().trim())
                .configJson(req.configJson())
                .updatedAt(System.currentTimeMillis())
                .build();
        repo.upsert(t);
        return t;
    }

    public void delete(String hostId, FrpMode mode) {
        repo.deleteByHostAndMode(hostId, mode);
    }
}
