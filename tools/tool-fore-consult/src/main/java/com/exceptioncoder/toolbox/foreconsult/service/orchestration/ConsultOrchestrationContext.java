package com.exceptioncoder.toolbox.foreconsult.service.orchestration;

import java.util.ArrayList;
import java.util.List;

/** Mutable prompt-building context shared only during one pipeline execution. */
public final class ConsultOrchestrationContext {

    private final ConsultOrchestrationRequest request;
    private final List<PromptSection> sections = new ArrayList<>();

    public ConsultOrchestrationContext(ConsultOrchestrationRequest request) {
        this.request = request;
    }

    public ConsultOrchestrationRequest request() {
        return request;
    }

    public void addSection(String title, String content) {
        sections.add(new PromptSection(title, content.strip()));
    }

    public String renderPrompt(String pipelineVersion) {
        String modules = request.moduleNames().isEmpty()
                ? "未指定（先面向整个系统定位）"
                : String.join("、", request.moduleNames());
        StringBuilder prompt = new StringBuilder()
                .append("【业务咨询调度协议】").append(pipelineVersion).append('\n')
                .append("咨询类型：").append(request.followUp() ? "当前问题的追问" : "新咨询").append('\n')
                .append("目标系统：").append(request.systemName()).append('\n')
                .append("候选模块：").append(modules).append('\n')
                .append("回答对象：").append(request.role()).append('\n')
                .append("用户原始问题：\n").append(request.question().strip()).append('\n');
        for (int i = 0; i < sections.size(); i++) {
            PromptSection section = sections.get(i);
            prompt.append("\n【步骤 ").append(i + 1).append("：")
                    .append(section.title()).append("】\n")
                    .append(section.content()).append('\n');
        }
        return prompt.toString().strip();
    }

    private record PromptSection(String title, String content) {
    }
}
