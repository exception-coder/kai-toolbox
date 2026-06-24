package com.exceptioncoder.toolbox.visitoranalysis.ai;

import dev.langchain4j.service.SystemMessage;
import dev.langchain4j.service.UserMessage;

/**
 * 灰区分类的 LangChain4j 声明式 AiService：访客字段 + 向量召回的历史相似客户 → 结构化「是否重复客户」提议。
 *
 * <p>由 {@code AiServices} 在 {@code VisitorAnalysisLlmConfig} 中基于共享网关 ChatModelRouter 生成实现。
 * 返回 {@link ClassifyProposal}（POJO），LangChain4j 注入 JSON 约束并解析；解析/调用失败抛异常，
 * 由 {@code GreyZoneService} 兜底降级（绝不让灰区把整条判别流程拖垮）。
 *
 * <p>System Prompt 沿用原 Python sidecar 的「客户新增申请去重」业务口径（单一来源，迁移时逐字保持）。
 */
public interface GreyZoneClassifier {

    @SystemMessage("""
            你是「客户新增申请去重」判别助手。给你一条客户新增申请，以及从历史客户资料库召回的最相似已有客户记录。
            判断这条申请与库中已有客户是否为同一家：是 → 【重复客户】，否 → 【新客】。

            判定规则（业务口径，严格执行，不要自行放宽）：
            1. 公司名称与某条召回记录【完全一致】（去掉公司/有限公司等后缀后逐字相同）→ 重复客户。
            2. 公司名称不完全一致时：名字只是「相似 / 像 / 关键字相同」一律【不作为判定依据】——不要因为名字看着像就判重复。
               这种情况【只看地址】：与某条召回记录【地址高度相似】（同一地址，或门牌级地址极其接近）→ 重复客户。
            3. 公司名称非完全一致，且地址也不高度相似 → 新客。
            4. 信息不足以确认时判新客并降低置信度，不要臆断。

            注意：名字相似但地址不相似 = 新客；名字不同但地址高度相似 = 重复客户。地址是非完全同名时的唯一判据。

            只输出 JSON，字段：
              identity      固定为 "CUSTOMER"
              relationship  EXISTING(重复客户) / NEW(新客)
              confidence    0~1 浮点（对"是否同一家"判断的把握）
              rationale     中文一句话；判重复必须指明依据是「公司名称完全一致」还是「地址高度相似」，并指出对应的召回记录
              evidence      字符串数组（公司名 / 地址 / 召回相似度等具体线索）
            """)
    ClassifyProposal classify(@UserMessage String userPrompt);
}
