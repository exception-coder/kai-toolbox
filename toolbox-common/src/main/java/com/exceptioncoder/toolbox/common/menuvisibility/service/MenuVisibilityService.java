package com.exceptioncoder.toolbox.common.menuvisibility.service;

import com.exceptioncoder.toolbox.common.menuvisibility.domain.MenuVisibility;
import com.exceptioncoder.toolbox.common.menuvisibility.repository.MenuVisibilityRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Optional;
import java.util.regex.Pattern;

/**
 * 菜单显隐偏好：按登录用户读写「可见模块 id 白名单」。
 * userId 由 Controller 从登录态（AuthContext）取，Service 不接受外部传入 user，避免越权改他人配置。
 */
@Service
public class MenuVisibilityService {

    /** 与前端 FeatureManifest.id 保持一致：kebab-case，首字符字母。 */
    private static final Pattern MENU_ID_PATTERN = Pattern.compile("^[a-z][a-z0-9-]{0,63}$");
    /** 单用户白名单条数上限，防异常大 body。 */
    private static final int MAX_IDS = 500;

    private final MenuVisibilityRepository repository;
    private final ObjectMapper objectMapper;

    public MenuVisibilityService(MenuVisibilityRepository repository, ObjectMapper objectMapper) {
        this.repository = repository;
        this.objectMapper = objectMapper;
    }

    /** 该用户的可见白名单；无记录返回 empty（前端据此走默认/迁移）。 */
    public Optional<MenuVisibility> find(long userId) {
        return repository.findByUser(userId);
    }

    /** 把 visible_ids_json 解析回 id 列表；解析失败视为空列表（脏数据不炸接口）。 */
    public List<String> parseIds(MenuVisibility mv) {
        if (mv == null || mv.getVisibleIdsJson() == null || mv.getVisibleIdsJson().isBlank()) {
            return List.of();
        }
        try {
            List<String> ids = objectMapper.readValue(mv.getVisibleIdsJson(), new TypeReference<>() {});
            return ids == null ? List.of() : ids;
        } catch (JsonProcessingException e) {
            return List.of();
        }
    }

    /** upsert：ids 必须是合法 id 的数组（去重后落库）。返回落库后的行。 */
    public MenuVisibility save(long userId, List<String> ids) {
        if (ids == null) {
            throw new IllegalArgumentException("visibleIds must not be null");
        }
        if (ids.size() > MAX_IDS) {
            throw new IllegalArgumentException("visibleIds too many, max " + MAX_IDS);
        }
        List<String> clean = ids.stream().distinct().toList();
        for (String id : clean) {
            if (id == null || !MENU_ID_PATTERN.matcher(id).matches()) {
                throw new IllegalArgumentException(
                        "invalid menu id, must match ^[a-z][a-z0-9-]{0,63}$ : " + id);
            }
        }
        String json;
        try {
            json = objectMapper.writeValueAsString(clean);
        } catch (JsonProcessingException e) {
            throw new IllegalArgumentException("visibleIds is not serializable to JSON");
        }
        MenuVisibility mv = MenuVisibility.builder()
                .userId(userId)
                .visibleIdsJson(json)
                .updatedAt(System.currentTimeMillis())
                .build();
        repository.upsert(mv);
        return mv;
    }

    /** 恢复默认：删除该用户记录（读取时回落系统默认核心集）。幂等。 */
    public void reset(long userId) {
        repository.deleteByUser(userId);
    }
}
