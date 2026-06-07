package com.exceptioncoder.toolbox.resume.api;

import com.exceptioncoder.toolbox.resume.api.dto.BasicsPatchDto;
import com.exceptioncoder.toolbox.resume.api.dto.EducationDto;
import com.exceptioncoder.toolbox.resume.api.dto.ProjectDto;
import com.exceptioncoder.toolbox.resume.api.dto.SkillsDto;
import com.exceptioncoder.toolbox.resume.api.dto.WorkDto;
import com.exceptioncoder.toolbox.resume.service.ResumeDocumentService;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * 简历「细粒度结构化」REST 入口,供不说 MCP 的自有智能体 / 脚本直连。
 * 与 {@code ResumeMcpTools} 共用同一 {@link ResumeDocumentService},语义一致。
 *
 * <p>能力面定位为「agent 可操作」:刻意 <b>不</b> 加 {@code @SoftGuard}(与 MCP 端点一致放开),
 * 本机单用户、不暴露公网。整份 {@code /api/resume/state} 端点仍受软鉴权,前端不变。
 */
@RestController
@RequestMapping("/api/resume/document")
public class ResumeDocumentController {

    private final ResumeDocumentService service;

    public ResumeDocumentController(ResumeDocumentService service) {
        this.service = service;
    }

    @GetMapping
    public Map<String, Object> getDocument() {
        return service.getDocument();
    }

    @GetMapping("/projects")
    public Map<String, Object> listProjects() {
        return service.listProjects();
    }

    @PostMapping("/projects")
    public Map<String, Object> upsertProject(@RequestBody ProjectDto dto) {
        return service.upsertProject(dto);
    }

    @DeleteMapping("/projects/{id}")
    public Map<String, Object> removeProject(@PathVariable String id) {
        return service.removeProject(id);
    }

    @PostMapping("/work")
    public Map<String, Object> upsertWork(@RequestBody WorkDto dto) {
        return service.upsertWork(dto);
    }

    @DeleteMapping("/work/{id}")
    public Map<String, Object> removeWork(@PathVariable String id) {
        return service.removeWork(id);
    }

    @PostMapping("/education")
    public Map<String, Object> upsertEducation(@RequestBody EducationDto dto) {
        return service.upsertEducation(dto);
    }

    @DeleteMapping("/education/{id}")
    public Map<String, Object> removeEducation(@PathVariable String id) {
        return service.removeEducation(id);
    }

    @PutMapping("/skills")
    public Map<String, Object> setSkills(@RequestBody SkillsDto dto) {
        return service.setSkills(dto.skills());
    }

    @PatchMapping("/basics")
    public Map<String, Object> updateBasics(@RequestBody BasicsPatchDto dto) {
        return service.updateBasics(dto);
    }
}
