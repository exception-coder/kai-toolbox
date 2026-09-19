package com.exceptioncoder.toolbox.foreconsult.service;

import com.exceptioncoder.toolbox.common.auth.web.AuthContext;
import com.exceptioncoder.toolbox.foreconsult.api.dto.BusinessConsultModelPolicyRequest;
import com.exceptioncoder.toolbox.foreconsult.api.dto.BusinessConsultModelPolicyView;
import com.exceptioncoder.toolbox.foreconsult.repository.BusinessConsultModelPolicyRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

/** Owns the administrator-configured default model for ordinary consultation users. */
@Service
public class BusinessConsultModelPolicyService {

    private final BusinessConsultModelPolicyRepository repository;

    public BusinessConsultModelPolicyService(BusinessConsultModelPolicyRepository repository) {
        this.repository = repository;
    }

    /** Returns an empty view until an administrator selects a catalog model. */
    public BusinessConsultModelPolicyView get() {
        return repository.find().orElseGet(() -> new BusinessConsultModelPolicyView(null, null, null));
    }

    /** Saves the exact identifier and label selected from the current catalog. */
    public BusinessConsultModelPolicyView save(BusinessConsultModelPolicyRequest request) {
        repository.save(request.model().trim(), request.displayName().trim(), System.currentTimeMillis());
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

    private static String text(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
