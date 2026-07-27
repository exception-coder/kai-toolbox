package com.exceptioncoder.toolbox.common.eval;

import java.util.List;

/**
 * 评测样本来源：工具把自己「已被人工裁决过」的历史记录，暴露成可纳入黄金集的样本。
 *
 * <p>解决的问题：评测的标准答案不能凭空编，也不能拿模型自己的判断当答案（那是自己考自己）。
 * 最可靠的来源是生产中真实发生、且人工点过「确认 / 驳回」的记录——那两个按钮按下的瞬间就是标注。
 *
 * <p>为什么是「复制成用例」而不是「评测直接查你的表」：黄金集必须冻结。
 * 标准答案跟着生产数据实时变的话，两次跑批就不可比，而「两次跑批的差异」正是回归评测的唯一产出——
 * 那时 pass→fail 到底是模型退化还是数据集自己变了，永远说不清。冻结之后用例还能单独停用、改标注、补边界。
 *
 * <p>与 {@code ToolDescriptor} 同一形态：实现类注册为 Spring Bean 即被评测侧收集，
 * 各工具只读自己的表，不跨库查询，符合「工具按 schema 沙箱化」的约定。
 * 接口放 toolbox-common 是因为它是通用扩展点而非某个工具的业务代码——
 * 契约里不出现任何 bug / 咨询语义，只有「样本」。
 */
public interface EvalSampleSource {

    /** 全局唯一标识，如 {@code fore-consult-bugs}。 */
    String id();

    /** 界面展示名，如「业务系统咨询 · 已裁决缺陷」。 */
    String displayName();

    /** 样本对应的任务形态，与 eval_case.scenario 对齐，如 EXTRACTION。 */
    String scenario();

    /**
     * 收集当前可纳入的全部样本。
     *
     * <p>实现方只管吐数据，不需要关心哪些已经纳入过——去重由评测侧按 {@link Sample#sourceRef()} 统一处理，
     * 否则每个来源都要重复实现一遍幂等，还容易各写各的。
     */
    List<Sample> collect();

    /**
     * @param sourceRef    来源溯源键，必须稳定且全局唯一，如 {@code consult_bug:<id>}；评测侧靠它幂等去重
     * @param title        用例标题，人读用
     * @param inputJson    被测链路的入参 JSON 对象
     * @param expectedJson 黄金答案 JSON 对象
     * @param assertJson   断言配置 JSON 数组；传 {@code null} 则由评测侧从 expectedJson 按默认策略推导
     * @param tags         JSON 数组字符串，建议标注来源与标注强度（如 ["harvested","REJECTED"]）
     */
    record Sample(String sourceRef, String title, String inputJson, String expectedJson,
                  String assertJson, String tags) {
    }
}
