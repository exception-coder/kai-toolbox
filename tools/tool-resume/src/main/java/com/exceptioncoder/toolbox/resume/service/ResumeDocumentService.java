package com.exceptioncoder.toolbox.resume.service;

import com.exceptioncoder.toolbox.resume.api.dto.BasicsPatchDto;
import com.exceptioncoder.toolbox.resume.api.dto.EducationDto;
import com.exceptioncoder.toolbox.resume.api.dto.ProjectDto;
import com.exceptioncoder.toolbox.resume.api.dto.WorkDto;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * 简历「结构化操作」核心:在整份 {@code state} JSON 之上做 read-modify-write,
 * 提供按 id 幂等的单条 upsert / remove、basics 字段级 patch、skills 整组替换。
 *
 * <p>对外仍复用 {@link ResumeStateService} 的整份 KV 存储(单条 {@code state} JSON),
 * 对内用 Jackson JSON 树只改单点再写回,故既不动表结构,又避免整份覆盖误删其它内容。
 *
 * <p>并发:本机单用户、写极少,read-modify-write 不加锁(接受罕见竞态)。
 */
@Service
public class ResumeDocumentService {

    private static final String[] BASICS_FIELDS = {
            "name", "gender", "age", "experienceYears", "jobIntent", "city",
            "email", "phone", "avatar", "advantage"
    };

    private final ResumeStateService stateService;
    private final ObjectMapper mapper;
    /** 把 DTO 转 JSON 树时跳过 null 字段,实现「只覆盖显式给出的字段」的字段级 merge。 */
    private final ObjectMapper nonNullMapper;

    public ResumeDocumentService(ResumeStateService stateService, ObjectMapper mapper) {
        this.stateService = stateService;
        this.mapper = mapper;
        this.nonNullMapper = mapper.copy().setSerializationInclusion(JsonInclude.Include.NON_NULL);
    }

    // ---------------- 读 ----------------

    /** 读取完整简历(扁平:basics/work/projects/education/skills + template/accent)。 */
    public Map<String, Object> getDocument() {
        ObjectNode root = readRoot();
        @SuppressWarnings("unchecked")
        Map<String, Object> out = mapper.convertValue(data(root), LinkedHashMap.class);
        out.put("template", root.path("template").asText("classic"));
        out.put("accent", root.path("accent").asText("indigo"));
        return out;
    }

    /** 轻量列出项目:id + name + period。 */
    public Map<String, Object> listProjects() {
        ArrayNode arr = (ArrayNode) data(readRoot()).get("projects");
        List<Map<String, Object>> list = new ArrayList<>();
        for (JsonNode n : arr) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", n.path("id").asText(""));
            m.put("name", n.path("name").asText(""));
            m.put("period", n.path("period").asText(""));
            list.add(m);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("projects", list);
        out.put("count", arr.size());
        return out;
    }

    // ---------------- 项目 ----------------

    public Map<String, Object> upsertProject(ProjectDto dto) {
        require(dto.name(), "project name");
        ObjectNode root = readRoot();
        ArrayNode arr = (ArrayNode) data(root).get("projects");
        String id = idOrGen(dto.id(), "p-");
        boolean created = upsert(arr, projectSkeleton(), provided(dto), id, dto.position(), "front");
        writeRoot(root);
        return mutationResult(arr, id, "project", "projectCount", created);
    }

    public Map<String, Object> removeProject(String id) {
        return remove("projects", id, "projectCount");
    }

    // ---------------- 工作经历 ----------------

    public Map<String, Object> upsertWork(WorkDto dto) {
        require(dto.company(), "work company");
        ObjectNode root = readRoot();
        ArrayNode arr = (ArrayNode) data(root).get("work");
        String id = idOrGen(dto.id(), "w-");
        boolean created = upsert(arr, workSkeleton(), provided(dto), id, dto.position(), "front");
        writeRoot(root);
        return mutationResult(arr, id, "work", "workCount", created);
    }

    public Map<String, Object> removeWork(String id) {
        return remove("work", id, "workCount");
    }

    // ---------------- 教育 ----------------

    public Map<String, Object> upsertEducation(EducationDto dto) {
        require(dto.school(), "education school");
        ObjectNode root = readRoot();
        ArrayNode arr = (ArrayNode) data(root).get("education");
        String id = idOrGen(dto.id(), "e-");
        boolean created = upsert(arr, eduSkeleton(), provided(dto), id, dto.position(), "back");
        writeRoot(root);
        return mutationResult(arr, id, "education", "educationCount", created);
    }

    public Map<String, Object> removeEducation(String id) {
        return remove("education", id, "educationCount");
    }

    // ---------------- 技能 ----------------

    public Map<String, Object> setSkills(List<String> skills) {
        ObjectNode root = readRoot();
        ArrayNode arr = mapper.createArrayNode();
        if (skills != null) {
            for (String s : skills) {
                if (s != null) {
                    arr.add(s);
                }
            }
        }
        data(root).set("skills", arr);
        writeRoot(root);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("skills", mapper.convertValue(arr, Object.class));
        out.put("count", arr.size());
        return out;
    }

    // ---------------- 基本信息 ----------------

    public Map<String, Object> updateBasics(BasicsPatchDto dto) {
        ObjectNode root = readRoot();
        ObjectNode basics = (ObjectNode) data(root).get("basics");
        overlay(basics, nonNullMapper.valueToTree(dto));
        writeRoot(root);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("basics", mapper.convertValue(basics, Object.class));
        return out;
    }

    // ---------------- 内部:读写 root ----------------

    private ObjectNode readRoot() {
        ObjectNode root;
        Optional<String> json = stateService.getState();
        if (json.isPresent() && StringUtils.hasText(json.get())) {
            try {
                JsonNode parsed = mapper.readTree(json.get());
                root = parsed.isObject() ? (ObjectNode) parsed : mapper.createObjectNode();
            } catch (JsonProcessingException e) {
                throw new IllegalStateException("简历 JSON 解析失败", e);
            }
        } else {
            root = mapper.createObjectNode();
        }
        ensureShape(root);
        return root;
    }

    /** 补齐 {@code data.{basics,work,projects,education,skills}} 与 template/accent,保证后续操作不空指针。 */
    private void ensureShape(ObjectNode root) {
        ObjectNode data = root.has("data") && root.get("data").isObject()
                ? (ObjectNode) root.get("data") : root.putObject("data");
        if (!data.has("basics") || !data.get("basics").isObject()) {
            ObjectNode b = data.putObject("basics");
            for (String f : BASICS_FIELDS) {
                b.put(f, "");
            }
        }
        ensureArray(data, "work");
        ensureArray(data, "projects");
        ensureArray(data, "education");
        ensureArray(data, "skills");
        if (!root.has("template") || root.get("template").isNull()) {
            root.put("template", "classic");
        }
        if (!root.has("accent") || root.get("accent").isNull()) {
            root.put("accent", "indigo");
        }
    }

    private void ensureArray(ObjectNode parent, String field) {
        if (!parent.has(field) || !parent.get(field).isArray()) {
            parent.putArray(field);
        }
    }

    private void writeRoot(ObjectNode root) {
        try {
            stateService.saveState(mapper.writeValueAsString(root));
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("简历 JSON 序列化失败", e);
        }
    }

    private ObjectNode data(ObjectNode root) {
        return (ObjectNode) root.get("data");
    }

    // ---------------- 内部:通用 upsert / remove ----------------

    /**
     * 通用幂等 upsert:命中 id 字段级更新(只覆盖 provided 中出现的字段),否则按 skeleton 建新对象再插入。
     *
     * @return true=新增,false=更新
     */
    private boolean upsert(ArrayNode arr, ObjectNode skeleton, ObjectNode provided,
                           String id, String position, String defaultPosition) {
        provided.put("id", id);
        for (JsonNode n : arr) {
            if (n.isObject() && id.equals(n.path("id").asText())) {
                overlay((ObjectNode) n, provided);
                return false;
            }
        }
        overlay(skeleton, provided);
        String pos = StringUtils.hasText(position) ? position : defaultPosition;
        if ("back".equalsIgnoreCase(pos)) {
            arr.add(skeleton);
        } else {
            arr.insert(0, skeleton);
        }
        return true;
    }

    private Map<String, Object> remove(String arrayField, String id, String countKey) {
        ObjectNode root = readRoot();
        ArrayNode arr = (ArrayNode) data(root).get(arrayField);
        boolean removed = false;
        for (int i = 0; i < arr.size(); i++) {
            if (id.equals(arr.get(i).path("id").asText())) {
                arr.remove(i);
                removed = true;
                break;
            }
        }
        if (removed) {
            writeRoot(root);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("removed", removed);
        out.put(countKey, arr.size());
        return out;
    }

    private Map<String, Object> mutationResult(ArrayNode arr, String id, String itemKey,
                                               String countKey, boolean created) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put(itemKey, mapper.convertValue(findById(arr, id), Object.class));
        out.put(countKey, arr.size());
        out.put("created", created);
        return out;
    }

    private JsonNode findById(ArrayNode arr, String id) {
        for (JsonNode n : arr) {
            if (id.equals(n.path("id").asText())) {
                return n;
            }
        }
        return null;
    }

    /** 把目标对象中、provided 出现过的字段逐一覆盖(字段级 merge)。 */
    private void overlay(ObjectNode target, JsonNode provided) {
        provided.fields().forEachRemaining(e -> target.set(e.getKey(), e.getValue()));
    }

    /** DTO → 仅含非 null 字段的 JSON 树,并剔除存储结构中不存在的 {@code position}。 */
    private ObjectNode provided(Object dto) {
        ObjectNode node = nonNullMapper.valueToTree(dto);
        node.remove("position");
        return node;
    }

    private String idOrGen(String id, String prefix) {
        return StringUtils.hasText(id) ? id : prefix + UUID.randomUUID().toString().substring(0, 8);
    }

    private void require(String value, String name) {
        if (!StringUtils.hasText(value)) {
            throw new IllegalArgumentException(name + " 不能为空");
        }
    }

    // ---------------- skeleton ----------------

    private ObjectNode projectSkeleton() {
        ObjectNode o = mapper.createObjectNode();
        o.put("id", "");
        o.put("name", "");
        o.put("role", "");
        o.put("period", "");
        o.put("description", "");
        o.putArray("responsibilities");
        o.putArray("achievements");
        return o;
    }

    private ObjectNode workSkeleton() {
        ObjectNode o = mapper.createObjectNode();
        o.put("id", "");
        o.put("company", "");
        o.put("role", "");
        o.put("period", "");
        o.putArray("responsibilities");
        o.putArray("achievements");
        return o;
    }

    private ObjectNode eduSkeleton() {
        ObjectNode o = mapper.createObjectNode();
        o.put("id", "");
        o.put("school", "");
        o.put("degree", "");
        o.put("major", "");
        o.put("period", "");
        return o;
    }
}
