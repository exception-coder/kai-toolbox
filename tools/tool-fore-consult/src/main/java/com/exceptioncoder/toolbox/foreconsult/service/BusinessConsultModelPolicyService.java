package com.exceptioncoder.toolbox.foreconsult.service;

import com.exceptioncoder.toolbox.common.auth.web.AuthContext;
import com.exceptioncoder.toolbox.foreconsult.api.dto.BusinessConsultModelPolicyRequest;
import com.exceptioncoder.toolbox.foreconsult.api.dto.BusinessConsultModelPolicyView;
import com.exceptioncoder.toolbox.foreconsult.repository.BusinessConsultModelPolicyRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.nio.file.InvalidPathException;
import java.nio.file.Path;

/** Owns the administrator-configured runtime defaults for business consultations. */
@Service
public class BusinessConsultModelPolicyService {

    private final BusinessConsultModelPolicyRepository repository;
    private final CodexHomeDiscoveryService codexHomeDiscoveryService;

    public BusinessConsultModelPolicyService(BusinessConsultModelPolicyRepository repository,
                                             CodexHomeDiscoveryService codexHomeDiscoveryService) {
        this.repository = repository;
        this.codexHomeDiscoveryService = codexHomeDiscoveryService;
    }

    /** Returns an empty view until an administrator selects a catalog model. */
    public BusinessConsultModelPolicyView get() {
        return repository.find().orElseGet(() -> new BusinessConsultModelPolicyView(null, null, null, null));
    }

    /** Saves the exact identifier and label selected from the current catalog. */
    public BusinessConsultModelPolicyView save(BusinessConsultModelPolicyRequest request) {
        String codexHome = requireDiscoveredCodexHome(request.codexHome());
        repository.save(
                request.model().trim(), request.displayName().trim(), codexHome, System.currentTimeMillis());
        return get();
    }

    /** Administrators may override one session; ordinary users always use the configured default. */
    public String resolveForCurrentUser(String requestedModel) {
        boolean administrator = AuthContext.current()
                .map(principal -> principal.hasAnyRole("ADMIN"))
                .orElse(false);
        String requested = text(requestedModel);
        if (administrator && requested != null) {
            return requested;
        }
        String configured = get().model();
        if (configured == null) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "业务咨询默认模型尚未配置，请联系管理员在业务咨询页面选择并保存模型");
        }
        return configured;
    }

    /** All users use the same server-owned Auth directory for newly created consultations. */
    public String resolveCodexHome() {
        String configured = text(get().codexHome());
        if (configured == null) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "业务咨询默认 Auth 目录尚未配置，请联系管理员在业务咨询页面完成业务默认配置");
        }
        return configured;
    }

    private String requireDiscoveredCodexHome(String requested) {
        String normalized;
        try {
            normalized = Path.of(requested.trim()).toAbsolutePath().normalize().toString();
        } catch (InvalidPathException error) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Codex Auth 目录格式无效", error);
        }
        return codexHomeDiscoveryService.list().stream()
                .filter(candidate -> candidate.equalsIgnoreCase(normalized))
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "Codex Auth 目录不在当前服务可用目录中，请刷新目录后重新选择"));
    }

    private static String text(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
