"""把原系统「客户资料」CSV 导入访客分析的去重参照库 va_customer_ref（测试数据）。

为什么用 Python 写：CSV 是 UTF-8(BOM)，Python 显式按 utf-8-sig 读、sqlite3 按 UTF-8 写，
全程不经 PowerShell/控制台 ANSI 码页，杜绝中文乱码。

用法：
    python import_customer_ref.py [csv路径]
    默认 csv 路径见 DEFAULT_CSV；DB 取 ~/.kai-toolbox/toolbox.db。

幂等：按 cust_id 唯一索引 INSERT OR IGNORE，重复跑不会产生重复行。
归一化键(name_norm/keyword_norm/addr_norm)复刻 Java Normalizer 口径，保证与判别侧一致。
"""
from __future__ import annotations

import csv
import os
import re
import sys
import time

DEFAULT_CSV = r"C:\Users\zhang\export_202606221559.csv"
DB = os.path.expanduser("~/.kai-toolbox/toolbox.db")

# —— 复刻 Java Normalizer（必须与 Java 侧保持一致，否则匹配键漂移）——
_COMPANY_NOISE = ["股份有限公司", "有限责任公司", "有限公司", "(中国)", "（中国）",
                  "集团", "公司", "企业", "厂", "店"]


def _to_half_width(s: str) -> str:
    out = []
    for ch in s:
        code = ord(ch)
        if code == 12288:
            out.append(" ")
        elif 65280 < code < 65375:
            out.append(chr(code - 65248))
        else:
            out.append(ch)
    return "".join(out)


def norm_company(raw: str | None) -> str:
    if not raw:
        return ""
    s = re.sub(r"\s+", "", _to_half_width(raw)).strip()
    for noise in _COMPANY_NOISE:
        s = s.replace(noise, "")
    return s


def norm_addr(raw: str | None) -> str:
    if not raw or not raw.strip():
        return ""
    s = re.sub(r"\s+", "", _to_half_width(raw)).strip()
    result = ""
    for muni in ("北京", "上海", "天津", "重庆"):
        if muni in s:
            result += muni
            break
    if not result:
        m = re.search(r"([一-龥]{2,4})市", s)
        if m:
            result += m.group(1)
    m2 = re.search(r"([一-龥]{2,6}?)(新区|高新区|经济区|开发区|区|县)", s)
    if m2:
        result += m2.group(1)
    norm = result
    if not norm.strip():
        norm = re.sub(r"^[一-龥]{2,4}省", "", s)
        norm = norm[:8]
    return norm


def _to_float(v: str | None):
    if v is None or not str(v).strip():
        return None
    try:
        return float(v)
    except ValueError:
        return None


def _to_int(v: str | None):
    if v is None or not str(v).strip():
        return None
    try:
        return int(float(v))
    except ValueError:
        return None


def main() -> None:
    import sqlite3
    csv_path = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_CSV
    if not os.path.exists(csv_path):
        print(f"CSV 不存在: {csv_path}")
        sys.exit(1)

    with open(csv_path, encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))
    print(f"CSV 读取 {len(rows)} 行: {csv_path}")

    now = int(time.time() * 1000)
    con = sqlite3.connect(DB, timeout=10)
    cur = con.cursor()
    cur.execute("PRAGMA busy_timeout=8000")
    before = cur.execute("SELECT COUNT(*) FROM va_customer_ref").fetchone()[0]

    inserted = 0
    for r in rows:
        cust_id = _to_int(r.get("ID"))
        cust_name = (r.get("NAME") or "").strip()
        keyword = (r.get("BRIEFNAME") or "").strip()
        addr = (r.get("ADDRESS") or "").strip()
        cur.execute(
            """
            INSERT OR IGNORE INTO va_customer_ref
                (cust_id, cust_name, keyword, brand_name, cust_type, cust_category, biz_major,
                 province, city, district, cust_addr, checkin_addr, lng, lat, level, cust_property,
                 creator, note, name_norm, keyword_norm, addr_norm, created_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """,
            (
                cust_id, cust_name, keyword,
                (r.get("BRANDNAME") or "").strip(),
                (r.get("RUNTYPE_NAME") or "").strip(),   # 客户类型
                (r.get("MARKET_NAME") or "").strip(),    # 客户类别（市场类型）
                (r.get("AREA_NAME") or "").strip(),      # 经营大类
                (r.get("PROVINCESTR") or "").strip(),
                (r.get("CITYSTR") or "").strip(),
                (r.get("AREASTR") or "").strip(),
                addr,
                (r.get("DOORCODE") or "").strip(),       # 打卡/门牌地址
                _to_float(r.get("LONGITUDE")),
                _to_float(r.get("LATITUDE")),
                (r.get("LEVELS") or "").strip(),
                (r.get("PRIVATETYPE") or "").strip(),
                (r.get("MAKER") or "").strip(),
                (r.get("NOTES") or "").strip(),
                norm_company(cust_name),
                norm_company(keyword),
                norm_addr(addr),
                now,
            ),
        )
        inserted += cur.rowcount
    con.commit()
    after = cur.execute("SELECT COUNT(*) FROM va_customer_ref").fetchone()[0]
    print(f"va_customer_ref: {before} -> {after} (本次新增 {inserted} 行；重复 cust_id 已跳过)")
    # 抽样校验中文无乱码
    for row in cur.execute("SELECT cust_id, cust_name, keyword, province, city, district, addr_norm "
                           "FROM va_customer_ref ORDER BY id DESC LIMIT 3"):
        print("  样本:", row)
    con.close()


if __name__ == "__main__":
    main()
