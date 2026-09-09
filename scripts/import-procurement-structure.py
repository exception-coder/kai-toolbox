"""Read worksheet headers as data and bind them to stable procurement field keys."""
import argparse
import json
from pathlib import Path

import openpyxl


KEYS = """sequence notice_id province city title project_number related_notice_number original_notice
notice_stage scope_type notice_content procurement_amount amount_type total_investment amount_summary
source_url source owner owner_contact owner_phone agent agent_contact agent_phone winner winner_contact
winner_phone award_date contact_evidence sample_tier sample_reason recommendation_reason recommendation_level
scene_evidence engineering_evidence product_evidence attribute_evidence specification_evidence risk_evidence
pending_confirmation positive_keywords negative_keywords high_value_clues invalid_keyword_context
cooccurrence_review confirmation_status manual_notes sales_action""".split()
SYSTEM = {'notice_id', 'title', 'source_url', 'source'}
MANUAL = {'sequence', 'sample_tier', 'sample_reason', 'recommendation_reason', 'recommendation_level',
          'pending_confirmation', 'high_value_clues', 'cooccurrence_review', 'confirmation_status', 'manual_notes', 'sales_action'}
DESCRIPTIONS = {
    'sequence': '标注表人工序号，不代表公告身份。',
    'notice_id': '系统内稳定公告编号。', 'source': '当前公告来源站点。',
    'title': '公告登记或采集时保存的标题，不从 Excel 判断结论回填。',
    'source_url': '当前已登记公告的来源 URL。',
    'province': '建设或履约地点所在省份；不得从北京时间、代理地址推断。',
    'city': '建设或履约地点所在城市；不得从网站归属、代理地址推断。',
    'original_notice': '本公告明确提及的原公告名称或原公告链接；无引用则留空。',
    'notice_stage': '本公告所处环节，使用启用的 STG_ 词典代码。变更公告不得误判为原公告环节。',
    'scope_type': '本次实际招采对象，使用启用的 SCP_ 词典代码，不以整个项目背景代替。',
    'procurement_amount': '本次招采或成交金额，不是项目总投资。返回原文数字及元/万元/亿元单位，代码统一换算为万元。多标段不得擅自相加。',
    'total_investment': '仅项目明确总投资。返回原文数字及元/万元/亿元单位，代码换算为万元。不得与本次招采金额混用。',
    'amount_type': '金额对应的预算、最高限价、中标价等原文类型。',
    'award_date': '明确的中标或成交日期，不能直接采用网页发布日期。',
    'positive_keywords': '只引用符合启用关键词的章节、共现和排除条件的原文词语。字面命中不等于有效命中。',
    'negative_keywords': '只引用满足启用反向规则且未触发例外的原文词语。',
    'invalid_keyword_context': '逐字引用使关键词失效的上下文，不编写无原文支撑的结论。',
}


def extract(path):
    book = openpyxl.load_workbook(path, read_only=True, data_only=True)
    labels = [str(value) for value in next(book['销售判断候选'].values) if value is not None]
    book.close()
    if len(labels) != len(KEYS):
        raise ValueError(f'Expected {len(KEYS)} named columns, received {len(labels)}')
    fields = []
    for index, (key, label) in enumerate(zip(KEYS, labels)):
        group = ('公告信息' if index < 11 else '金额信息' if index < 15 else '公告信息' if index < 17
                 else '参与方与联系' if index < 28 else '样本与销售判断' if index < 32
                 else '判断证据' if index < 44 else '人工核验')
        mode = 'SYSTEM' if key in SYSTEM else 'MANUAL' if key in MANUAL else 'LLM'
        kind = 'DECIMAL' if key in {'procurement_amount', 'total_investment'} else 'DATE' if key == 'award_date' else 'TEXT'
        description = DESCRIPTIONS.get(key, ('人工维护，当前不自动推导销售评级或建议。' if mode == 'MANUAL'
                                      else f'提取{label}，保留逐字原文依据，无明确内容则留空；联系方式必须与对应机构角色一致。'
                                      if 'contact' in key or 'phone' in key else f'提取{label}的逐字原文，无明确证据则留空。'))
        fields.append(dict(key=key, label=label, group=group, type=kind, mode=mode, description=description, enabled=True, order=index + 1))
    return fields


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('workbook')
    parser.add_argument('output')
    args = parser.parse_args()
    fields = extract(args.workbook)
    Path(args.output).write_text(json.dumps(fields, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'Imported {len(fields)} field definitions; no sample values imported.')
