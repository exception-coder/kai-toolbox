package com.exceptioncoder.toolbox.claudechat.domain;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;
import java.util.Map;

/** 当前会话生成 SQL 前取得的目标表 DDL 证据。 */
public record SqlDdlEvidence(
        String evidenceId,
        String status,
        String project,
        String baselinePath,
        List<String> requestedTables,
        List<String> verifiedTables,
        List<String> missingTables,
        List<String> candidateProjects,
        Map<String, String> ddlFragments,
        String warning,
        long checkedAt) {

    public static final String STATUS_VERIFIED = "VERIFIED";
    public static final String STATUS_PARTIAL = "PARTIAL";
    public static final String STATUS_DDL_MISSING = "DDL_MISSING";
    public static final String STATUS_PROJECT_AMBIGUOUS = "PROJECT_AMBIGUOUS";
    public static final String STATUS_STALE = "STALE";
    public static final String STATUS_NOT_CHECKED = "NOT_CHECKED";

    /** 本工具只证明项目文件；真实库核验由已有资源工具返回独立证据。 */
    @JsonProperty("evidenceScope")
    public String evidenceScope() { return "PROJECT_SQL_FILES"; }

    /** 给模型可执行的补证路径，不要求用户先建快照，也不暗中扩大资源权限。 */
    @JsonProperty("recovery")
    public Recovery recovery() {
        if (requestedTables.isEmpty()) {
            return new Recovery("IDENTIFY_TABLES", "prepare_sql_context",
                    List.of("从需求及SQL/Mapper确定目标表和实际所属系统后重新核查。"),
                    "仅在业务对象无法确定时询问用户。", false);
        }
        if (STATUS_PROJECT_AMBIGUOUS.equals(status)) {
            return new Recovery("RESOLVE_OWNER", "discover_resources",
                    List.of("核对目标表所属系统；candidateProjects只表示本地目录候选，不证明表归属。",
                            "关联项目通过其已绑定资源调研；本工具的project参数不授予跨目录读取。"),
                    "仅在所属项目或目标环境无法从现有证据确定时询问。", false);
        }
        return new Recovery(STATUS_VERIFIED.equals(status) ? "CHECK_DEPLOYMENT_IF_NEEDED" : "DISCOVER_BOUND_RESOURCE",
                "discover_resources", List.of(
                    "先按表的实际所属系统发现资源，再用systemId读取该系统绑定；不因当前工作目录而改查其他业务库。",
                    "确认绑定启用、环境/schema及QUERY能力；可用时经execute_resource的QUERY只读核对目标表列、约束和索引，保留资源与时间证据。",
                    "生产、未知环境、未绑定资源及受限咨询沿原权限边界；工具缺失或拒绝时不绕过，不把目录发现当成已核验。",
                    "已有源码/迁移可用于待复核草稿。仅需复用时按项目约定保存带来源、环境与采集时间的DDL快照；不是生成SQL的前置条件。"),
                "资源不可用时只询问缺失的绑定/环境/访问条件，或请用户提供现成DDL；不默认要求手工落地项目DDL。", false);
    }

    /** userDdlRequired=false表示不强制手工提交DDL；步骤是建议，不代表资源已经发现或执行。 */
    public record Recovery(String action, String tool, List<String> steps, String userInputWhen,
                           boolean userDdlRequired) {}
}
