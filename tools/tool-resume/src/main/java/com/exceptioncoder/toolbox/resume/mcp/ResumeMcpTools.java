package com.exceptioncoder.toolbox.resume.mcp;

import com.exceptioncoder.toolbox.resume.api.dto.BasicsPatchDto;
import com.exceptioncoder.toolbox.resume.api.dto.EducationDto;
import com.exceptioncoder.toolbox.resume.api.dto.ProjectDto;
import com.exceptioncoder.toolbox.resume.api.dto.WorkDto;
import com.exceptioncoder.toolbox.resume.service.ResumeDocumentService;
import org.springframework.ai.tool.annotation.Tool;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

/**
 * 简历 MCP 工具适配器:每个 {@link Tool} 方法一行委派 {@link ResumeDocumentService}。
 * 由 {@code ResumeMcpConfig} 注册到 Spring AI MCP server,经 SSE 暴露给 MCP 客户端。
 *
 * <p>工具语义与 {@code /api/resume/document/*} REST 完全一致;按 id 幂等,只动目标分区。
 */
@Component
public class ResumeMcpTools {

    private final ResumeDocumentService service;

    public ResumeMcpTools(ResumeDocumentService service) {
        this.service = service;
    }

    @Tool(name = "resume_get",
            description = "读取完整简历:basics(基本信息)、work(工作经历)、projects(项目)、education(教育)、skills(技能) 以及 template/accent")
    public Map<String, Object> resumeGet() {
        return service.getDocument();
    }

    @Tool(name = "resume_list_projects",
            description = "轻量列出现有项目的 id、名称、起止时间;改动前先列出以确定要 upsert 还是 remove 哪个 id")
    public Map<String, Object> resumeListProjects() {
        return service.listProjects();
    }

    @Tool(name = "resume_upsert_project",
            description = "按 id 幂等新增或更新一条项目经历:命中 id 则只覆盖给出的字段,未命中则新增(position=front 插最前/back 插最后,默认 front)。不影响其它项目。id 缺省自动生成")
    public Map<String, Object> resumeUpsertProject(ProjectDto dto) {
        return service.upsertProject(dto);
    }

    @Tool(name = "resume_remove_project",
            description = "按 id 删除一条项目;id 不存在视为成功(no-op)")
    public Map<String, Object> resumeRemoveProject(String id) {
        return service.removeProject(id);
    }

    @Tool(name = "resume_upsert_work",
            description = "按 id 幂等新增或更新一条工作经历(字段:company/role/period/responsibilities/achievements)。命中 id 字段级更新,未命中新增。不影响其它条目")
    public Map<String, Object> resumeUpsertWork(WorkDto dto) {
        return service.upsertWork(dto);
    }

    @Tool(name = "resume_remove_work",
            description = "按 id 删除一条工作经历;id 不存在视为成功")
    public Map<String, Object> resumeRemoveWork(String id) {
        return service.removeWork(id);
    }

    @Tool(name = "resume_upsert_education",
            description = "按 id 幂等新增或更新一条教育经历(字段:school/degree/major/period)。命中 id 字段级更新,未命中新增(默认插最后)")
    public Map<String, Object> resumeUpsertEducation(EducationDto dto) {
        return service.upsertEducation(dto);
    }

    @Tool(name = "resume_remove_education",
            description = "按 id 删除一条教育经历;id 不存在视为成功")
    public Map<String, Object> resumeRemoveEducation(String id) {
        return service.removeEducation(id);
    }

    @Tool(name = "resume_set_skills",
            description = "整组替换技能标签(传入全集,非追加;空数组即清空)")
    public Map<String, Object> resumeSetSkills(List<String> skills) {
        return service.setSkills(skills);
    }

    @Tool(name = "resume_update_basics",
            description = "字段级更新基本信息:只覆盖给出的字段(name/gender/age/experienceYears/jobIntent/city/email/phone/avatar/advantage),未给出的保持原值,不会误清联系方式")
    public Map<String, Object> resumeUpdateBasics(BasicsPatchDto dto) {
        return service.updateBasics(dto);
    }
}
