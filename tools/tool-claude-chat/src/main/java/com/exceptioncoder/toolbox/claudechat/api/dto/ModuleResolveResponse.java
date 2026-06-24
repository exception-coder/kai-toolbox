package com.exceptioncoder.toolbox.claudechat.api.dto;

import com.exceptioncoder.toolbox.claudechat.api.dto.ProjectModulesResponse.ModuleView;

import java.util.List;

/**
 * 「模块路由」解析结果：把一句自然语言（如「去开发 commodity 模块」「korepos 的 refund 模块」）
 * 确定性地解析为候选 (项目, 模块)，供前端定位后拉起会话。
 *
 * <p>解析与匹配全在后端用代码完成（剥离填充词 + 识别项目名 + 模块名归一化匹配），不依赖 LLM，
 * 单一来源、可测。candidates 已按匹配优先级降序：精确 > 前缀 > 包含，命中项目提示者再加权前置。</p>
 *
 * @param query       原始输入（去空白后）
 * @param moduleHint  剥离填充词/项目名后用于匹配模块的关键片段
 * @param projectHint 在输入中识别到的项目目录名；未识别为空串
 * @param candidates  候选模块，0 个=未匹配，1 个=可直接确认拉起，多个=需用户选项目
 */
public record ModuleResolveResponse(String query, String moduleHint, String projectHint, List<Candidate> candidates) {

    /**
     * 一个候选定位。
     *
     * @param project     模块所属项目目录名
     * @param projectPath 项目绝对路径（前端用它选中左侧项目）
     * @param module      命中的模块（含 absPath，作为会话 cwd）
     * @param match       命中方式：exact / prefix / contains，用于前端展示与排序透明化
     */
    public record Candidate(String project, String projectPath, ModuleView module, String match) {
    }
}
