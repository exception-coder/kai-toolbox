package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSettingRepository;
import com.exceptioncoder.toolbox.common.auth.web.AuthContext;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/** 持久化本机网关档案；读取响应只暴露脱敏元数据，不返回已保存的 Key。 */
@Service
public class ProviderProfileService {

    private static final String SETTING_NAME = "gateway-provider-profiles";
    private static final TypeReference<List<StoredProfile>> PROFILE_LIST = new TypeReference<>() {};

    private final ClaudeChatSettingRepository settings;
    private final ObjectMapper mapper;

    public ProviderProfileService(ClaudeChatSettingRepository settings, ObjectMapper mapper) {
        this.settings = settings;
        this.mapper = mapper;
    }

    public record ProfileView(String id, String name, String baseUrl, String model, boolean hasKey) {}

    public record ProfileInput(String name, String baseUrl, String key, String model) {}

    public record LegacyProfile(String id, String name, String baseUrl, String key, String model) {}

    public record ProviderCredentials(String baseUrl, String key) {
        @Override
        public String toString() {
            return "ProviderCredentials[baseUrl=" + baseUrl + ", key=<redacted>]";
        }
    }

    private record StoredProfile(String id, String name, String baseUrl, String key, String model) {
        ProfileView view() {
            return new ProfileView(id, name, baseUrl, model, key != null && !key.isBlank());
        }

        @Override
        public String toString() {
            return "StoredProfile[id=" + id + ", key=<redacted>]";
        }
    }

    public synchronized List<ProfileView> list() {
        return read(currentOwnerId()).stream().map(StoredProfile::view).toList();
    }

    public synchronized ProviderCredentials resolve(String id) {
        return resolve(id, currentOwnerId());
    }

    public synchronized ProviderCredentials resolve(String id, Long ownerId) {
        StoredProfile profile = read(ownerId).stream().filter(item -> item.id().equals(id)).findFirst()
                .orElseThrow(() -> new IllegalArgumentException("服务商档案不存在，请刷新列表后重试"));
        return new ProviderCredentials(profile.baseUrl(), profile.key());
    }

    public synchronized ProfileView create(ProfileInput input) {
        return create(input, null);
    }

    public synchronized ProfileView create(ProfileInput input, String requestId) {
        Long ownerId = currentOwnerId();
        List<StoredProfile> profiles = read(ownerId);
        String id = requestId == null || requestId.isBlank() ? UUID.randomUUID().toString() : requestId;
        if (!id.matches("[A-Za-z0-9_-]{1,100}")) {
            throw new IllegalArgumentException("服务商创建请求 ID 无效");
        }
        for (StoredProfile existing : profiles) {
            if (existing.id().equals(id)) {
                StoredProfile requested = validated(id, input, null);
                if (!existing.equals(requested)) {
                    throw new IllegalArgumentException("创建请求 ID 已用于其他服务商内容，请刷新后重试");
                }
                return existing.view();
            }
        }
        StoredProfile profile = validated(id, input, null);
        for (StoredProfile existing : profiles) {
            if (existing.name().equalsIgnoreCase(profile.name())
                    && existing.baseUrl().replaceAll("/+$", "")
                            .equalsIgnoreCase(profile.baseUrl().replaceAll("/+$", ""))) {
                if (existing.key().equals(profile.key()) && existing.model().equals(profile.model())) {
                    return existing.view();
                }
                throw new IllegalArgumentException("同名同地址服务商档案已存在，请编辑现有档案");
            }
        }
        profiles.add(profile);
        write(ownerId, profiles);
        return profile.view();
    }

    public synchronized ProfileView update(String id, ProfileInput input) {
        Long ownerId = currentOwnerId();
        List<StoredProfile> profiles = read(ownerId);
        for (int index = 0; index < profiles.size(); index++) {
            StoredProfile existing = profiles.get(index);
            if (existing.id().equals(id)) {
                StoredProfile updated = validated(id, input, existing.key());
                profiles.set(index, updated);
                write(ownerId, profiles);
                return updated.view();
            }
        }
        throw new IllegalArgumentException("服务商档案不存在，请刷新列表后重试");
    }

    public synchronized void delete(String id) {
        Long ownerId = currentOwnerId();
        List<StoredProfile> profiles = read(ownerId);
        if (profiles.removeIf(item -> item.id().equals(id))) {
            write(ownerId, profiles);
        }
    }

    /** 按旧浏览器档案 ID 幂等导入；服务端已有同 ID 档案时保留现有版本。 */
    public synchronized List<ProfileView> importLegacy(List<LegacyProfile> legacy) {
        if (legacy == null || legacy.size() > 100) {
            throw new IllegalArgumentException("服务商档案导入数量无效");
        }
        Long ownerId = currentOwnerId();
        List<StoredProfile> profiles = read(ownerId);
        boolean changed = false;
        for (LegacyProfile item : legacy) {
            if (item == null || item.id() == null || !item.id().matches("[A-Za-z0-9_-]{1,100}")) {
                throw new IllegalArgumentException("旧服务商档案 ID 无效");
            }
            if (profiles.stream().anyMatch(profile -> profile.id().equals(item.id()))) {
                continue;
            }
            profiles.add(validated(item.id(),
                    new ProfileInput(item.name(), item.baseUrl(), item.key(), item.model()), null));
            changed = true;
        }
        if (changed) {
            write(ownerId, profiles);
        }
        return profiles.stream().map(StoredProfile::view).toList();
    }

    private StoredProfile validated(String id, ProfileInput input, String existingKey) {
        if (input == null) {
            throw new IllegalArgumentException("服务商档案不能为空");
        }
        String name = trim(input.name());
        String baseUrl = trim(input.baseUrl());
        String key = trim(input.key());
        if (name.isEmpty() || name.length() > 100) {
            throw new IllegalArgumentException("请填写 100 字以内的服务商名称");
        }
        if (baseUrl.isEmpty() || baseUrl.length() > 2048) {
            throw new IllegalArgumentException("请填写有效的服务商 baseURL");
        }
        try {
            URI uri = URI.create(baseUrl);
            if (!("https".equalsIgnoreCase(uri.getScheme()) || "http".equalsIgnoreCase(uri.getScheme()))
                    || uri.getHost() == null || uri.getUserInfo() != null) {
                throw new IllegalArgumentException("服务商 baseURL 须为 HTTP(S) 地址且不能包含账号密码");
            }
        } catch (IllegalArgumentException error) {
            throw new IllegalArgumentException("服务商 baseURL 须为有效的 HTTP(S) 地址", error);
        }
        if (key.isEmpty()) {
            key = existingKey;
        }
        if (key == null || key.isBlank()) {
            throw new IllegalArgumentException("请填写 API Key");
        }
        return new StoredProfile(id, name, baseUrl, key, trim(input.model()));
    }

    private List<StoredProfile> read(Long ownerId) {
        String payload = settings.find(settingName(ownerId));
        if (payload == null) {
            return new ArrayList<>();
        }
        try {
            return new ArrayList<>(mapper.readValue(payload, PROFILE_LIST));
        } catch (Exception error) {
            throw new IllegalStateException("服务商档案配置损坏，请先检查本地数据库备份", error);
        }
    }

    private void write(Long ownerId, List<StoredProfile> profiles) {
        try {
            settings.upsert(settingName(ownerId), mapper.writeValueAsString(profiles));
        } catch (com.fasterxml.jackson.core.JsonProcessingException error) {
            throw new IllegalStateException("序列化服务商档案失败", error);
        }
    }

    private static String trim(String value) {
        return value == null ? "" : value.trim();
    }

    private static Long currentOwnerId() {
        return AuthContext.current().map(principal -> principal.userId()).orElse(null);
    }

    private static String settingName(Long ownerId) {
        return ownerId == null ? SETTING_NAME : SETTING_NAME + ":" + ownerId;
    }
}
