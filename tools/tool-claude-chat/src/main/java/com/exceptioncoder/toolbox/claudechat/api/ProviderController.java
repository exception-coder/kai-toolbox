package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.claudechat.api.dto.ModelInfo;
import com.exceptioncoder.toolbox.claudechat.service.ProviderModelService;
import com.exceptioncoder.toolbox.claudechat.service.ProviderProfileService;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.http.ResponseEntity;

import java.util.List;

/**
 * Third-party gateway profiles and model catalog. Read responses never return stored API Keys.
 */
@RestController
@RequestMapping("/api/claude-chat/provider")
public class ProviderController {

    private final ProviderModelService service;
    private final ProviderProfileService profiles;

    public ProviderController(ProviderModelService service, ProviderProfileService profiles) {
        this.service = service;
        this.profiles = profiles;
    }

    public record ModelsRequest(String profileId, String baseUrl, String key) {}

    public record CreateProfileRequest(String requestId, String name, String baseUrl, String key, String model) {}

    /** error 非空表示拉取失败（models 为空），前端据此提示具体原因而非笼统“没拉到”。 */
    public record ModelsResponse(List<ModelInfo> models, String error) {}

    @PostMapping("/models")
    public ModelsResponse models(@RequestBody ModelsRequest req) {
        ProviderProfileService.ProviderCredentials credentials = req.profileId() == null
                ? new ProviderProfileService.ProviderCredentials(req.baseUrl(), req.key())
                : profiles.resolve(req.profileId());
        ProviderModelService.FetchResult r = service.fetch(credentials.baseUrl(), credentials.key());
        return new ModelsResponse(r.models(), r.error());
    }

    @GetMapping("/profiles")
    public List<ProviderProfileService.ProfileView> listProfiles() {
        return profiles.list();
    }

    @PostMapping("/profiles")
    public ProviderProfileService.ProfileView createProfile(@RequestBody CreateProfileRequest input) {
        return profiles.create(new ProviderProfileService.ProfileInput(
                input.name(), input.baseUrl(), input.key(), input.model()), input.requestId());
    }

    @PutMapping("/profiles/{id}")
    public ProviderProfileService.ProfileView updateProfile(@PathVariable String id,
                                                             @RequestBody ProviderProfileService.ProfileInput input) {
        return profiles.update(id, input);
    }

    @DeleteMapping("/profiles/{id}")
    public ResponseEntity<Void> deleteProfile(@PathVariable String id) {
        profiles.delete(id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/profiles/import")
    public List<ProviderProfileService.ProfileView> importProfiles(
            @RequestBody List<ProviderProfileService.LegacyProfile> input) {
        return profiles.importLegacy(input);
    }
}
