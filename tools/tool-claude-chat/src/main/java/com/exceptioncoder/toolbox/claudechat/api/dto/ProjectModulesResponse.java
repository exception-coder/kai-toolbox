package com.exceptioncoder.toolbox.claudechat.api.dto;

import java.util.List;

/**
 * 项目模块扫描结果（确定性扫描：按构建标志文件识别模块）。供「项目工作台」选项目后列模块、懒建会话。
 *
 * @param project          项目目录名
 * @param projectPath      项目绝对路径
 * @param exists           项目目录是否存在且在配置根内
 * @param projectType        项目类型代码（maven/gradle/node/go/rust/python/java-web/knowledge/unknown），供前端着色
 * @param projectTypeLabel   项目类型中文标签，供「项目工作台」右上角展示「这是什么项目」
 * @param fromKnowledge      本次模块是否来自知识库 modules.json（false=按构建文件自动识别的兜底结果）
 * @param knowledgeBaseDir   当前配置的知识库根目录（project-domain-knowledge 的 knowledge/ 目录）；未配置为空串
 * @param knowledgeDirExists 上述知识库根目录在磁盘上是否存在，供工作台提示用户配置
 * @param modules            扫出的模块（含项目根自身若它也是一个模块），按相对路径升序
 */
public record ProjectModulesResponse(String project, String projectPath, boolean exists,
                                     String projectType, String projectTypeLabel,
                                     boolean fromKnowledge, String knowledgeBaseDir, boolean knowledgeDirExists,
                                     List<ModuleView> modules) {

    /**
     * @param name     模块目录名或业务中文名
     * @param relPath  相对项目根的路径（项目根自身为 "."）；用斜杠分隔
     * @param absPath  模块绝对路径，作为 claude-chat 会话的 cwd
     * @param type     识别到的模块类型：maven / gradle / node / go / rust / python；
     *                 或来自知识库 modules.json 的模块（标记为 knowledge）
     * @param summary  业务说明（来自知识库；自动识别的模块为空）
     * @param children 子模块（知识库声明的嵌套模块，如 crm 域下的子模块）；无则为空列表
     * @param codePath 后端代码目录绝对路径（知识库模块来自 modules.json；自动识别模块=模块目录本身）；无则空串
     * @param webPath  前端代码目录绝对路径（知识库模块来自 modules.json）；无则空串。供新建会话时把编码范围带进提示词
     */
    public record ModuleView(String name, String relPath, String absPath, String type,
                             String summary, List<ModuleView> children, String codePath, String webPath) {
    }
}
