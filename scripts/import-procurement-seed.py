"""Extract supplied workbooks as versioned procurement seed data; never execute cell content."""
import argparse
import json
from pathlib import Path
import openpyxl


def extract(notices_path, rules_path):
    notices_book = openpyxl.load_workbook(notices_path, data_only=True)
    rules_book = openpyxl.load_workbook(rules_path, data_only=True)
    sites = [dict(id=row[0], name=row[0], host=row[0], enabled=True,
                  listUrl='', notes='；'.join(str(v) for v in row[5:] if v))
             for row in list(notices_book['站点逻辑'].values)[1:] if row[0]]
    source_rows = list(notices_book['原始数据'].values)
    sources = {str(row[1]): dict(zip(source_rows[0], row)) for row in source_rows[1:]}
    capture_rows = list(notices_book['抓取明细'].values)
    notices = [dict(id=row[2], siteId=row[3], url=row[6], title=row[7],
                    sourceData=dict(workbook=Path(notices_path).name,
                                    original=sources.get(row[2], {}),
                                    historicalCapture=dict(zip(capture_rows[0], row))))
               for row in capture_rows[1:] if row[2]]
    unique_notices = {}
    for notice in notices:
        existing = unique_notices.get(notice['url'])
        if existing:
            existing['sourceData'].setdefault('duplicateSourceRows', []).append(notice)
        else:
            unique_notices[notice['url']] = notice
    notices = list(unique_notices.values())
    categories = ['KEYWORD', 'NEGATIVE', 'CONTEXT', 'DICTIONARY']
    rules = []
    for sheet, category in zip(rules_book, categories):
        headers = []
        for row in sheet.values:
            code = str(row[0] or '').strip()
            if code in ('keyword_code', 'rule_code', 'rule_id', 'code'):
                headers = [str(v or '').strip() for v in row]
            elif code.startswith(('KW_', 'NEG_', 'RULE_', 'STG_', 'SCP_', 'ROLE_')):
                fields = {key: str(value or '').strip() for key, value in zip(headers[1:], row[1:]) if key}
                rules.append(dict(id=code, category=category, name=str(row[1]), enabled=True, fields=fields))
    return dict(version='excel-20260901-v1', sites=sites, notices=notices, rules=rules)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('notices')
    parser.add_argument('rules')
    parser.add_argument('output')
    args = parser.parse_args()
    data = extract(args.notices, args.rules)
    target = Path(args.output)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(data, ensure_ascii=False, indent=2, default=str), encoding='utf-8')
    print(json.dumps({key: len(data[key]) for key in ('sites', 'notices', 'rules')}))
