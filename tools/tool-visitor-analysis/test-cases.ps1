# ============================================================
# 访客分析全流程验证脚本（PowerShell）
# 前置：
#   1. mvn spring-boot:run（或 java -jar）启动 toolbox (:8080)
#   2. sqlite3 "$env:USERPROFILE\.kai-toolbox\toolbox.db" ".read test-fixtures.sql"
#   3. Python sidecar 已启动（Path E 需要）
# ============================================================

$BASE = "http://localhost:8080/api/visitor-analysis"

function Invoke-VA($label, $body) {
    Write-Host "`n========== $label ==========" -ForegroundColor Cyan
    Write-Host "请求: $($body | ConvertTo-Json -Compress)" -ForegroundColor Gray
    $r = Invoke-RestMethod -Uri "$BASE/analyze-sync" -Method POST `
         -ContentType "application/json" -Body ($body | ConvertTo-Json)
    Write-Host "结果: identity=$($r.identity)/$($r.relationship)  confidence=$($r.confidence)  decidedBy=$($r.decidedBy)" -ForegroundColor Green
    if ($r.rationale) { Write-Host "理由: $($r.rationale)" -ForegroundColor Yellow }
    if ($r.needsReview) { Write-Host "⚠️  needsReview=true（待人工确认）" -ForegroundColor Magenta }
    $r
}

# ── Path A: 手机精确命中 → rule:customer/EXISTING ──────────────────
Invoke-VA "Path A · 手机精确命中老客户" @{
    name        = "腾讯来访员工"
    phone       = "13811111111"
    company     = "某公司"
    companyAddr = ""
    email       = ""
    purpose     = "回访客户"
}
# 期望：CUSTOMER/EXISTING，0.95，decidedBy=rule:customer

# ── Path B: 公司名精确命中（老客户） ───────────────────────────────
Invoke-VA "Path B · 公司名命中老客户" @{
    name        = "李工"
    phone       = "18999990001"
    company     = "华为技术有限公司"      # Normalizer → "华为技术" → 命中
    companyAddr = "深圳龙岗区坂田华为基地"
    email       = "li@huawei.com"
    purpose     = "技术合作"
}
# 期望：CUSTOMER/EXISTING，0.95，decidedBy=rule:customer

# ── Path B2: 流失客户（最近成交 2020-01，超 365 天）──────────────────
Invoke-VA "Path B2 · 公司名命中流失客户" @{
    name        = "马总"
    phone       = "18999990002"
    company     = "阿里巴巴"
    companyAddr = "杭州西湖区"
    email       = ""
    purpose     = "希望重新合作"
}
# 期望：CUSTOMER/CHURNED，0.95，decidedBy=rule:customer

# ── Path C: 公司别名命中 ──────────────────────────────────────────
Invoke-VA "Path C · 英文别名命中腾讯" @{
    name        = "Tom Lee"
    phone       = "18999990003"
    company     = "Tencent"              # 别名 → canonical 腾讯 → 命中
    companyAddr = "Shenzhen Nanshan"
    email       = "tom.lee@tencent.com"
    purpose     = "partnership discussion"
}
# 期望：CUSTOMER/EXISTING，0.90，decidedBy=rule:customer:alias

# ── Path D: 竞品名单命中 ──────────────────────────────────────────
Invoke-VA "Path D · 竞品直接命中" @{
    name        = "张大牛"
    phone       = "18999990004"
    company     = "字节跳动"             # 直接命中竞品名单
    companyAddr = "北京海淀区"
    email       = "zhang@bytedance.com"
    purpose     = "了解市场情况"
}
# 期望：COMPETITOR/NONE，0.99，decidedBy=rule:competitor

# ── Path D2: 竞品别名命中 ─────────────────────────────────────────
Invoke-VA "Path D2 · 竞品别名命中（抖音）" @{
    name        = "王晓燕"
    phone       = "18999990005"
    company     = "抖音"                 # 别名 → canonical 字节跳动 → 竞品
    companyAddr = "北京朝阳区"
    email       = ""
    purpose     = "招聘"
}
# 期望：COMPETITOR/NONE，0.99，decidedBy=rule:competitor

# ── Path E: 无命中 → 灰区 → Python sidecar ─────────────────────────
Write-Host "`n========== Path E · 灰区（需 Python sidecar 在线）==========" -ForegroundColor Cyan
$sidecarStatus = Invoke-RestMethod -Uri "$BASE/sidecar-health" -Method GET
Write-Host "sidecar 状态: online=$($sidecarStatus.online)" -ForegroundColor $(if ($sidecarStatus.online) {"Green"} else {"Red"})

Invoke-VA "Path E1 · 完全陌生公司（灰区 LLM）" @{
    name        = "张明"
    phone       = "15600000001"
    company     = "云图科技"             # 完全不在任何库里
    companyAddr = "深圳宝安区石岩镇"
    email       = "zhangming@yuntu.com"
    purpose     = "了解产品，有采购意向"
}
# 期望：CUSTOMER/NEW 或 UNKNOWN（取决于 LLM），confidence 偏低，needsReview 可能 true

Invoke-VA "Path E2 · 同地址提示（地址软匹配）" @{
    name        = "陌生访客"
    phone       = "15600000002"
    company     = "腾讯创业园某小公司"   # 公司名无法匹配
    companyAddr = "深圳市南山区科技园南区"  # 归一化→深圳南山，与腾讯同区
    email       = ""
    purpose     = "洽谈业务"
}
# 期望：灰区，addr_hint 提示"深圳南山有已知客户：腾讯"，LLM 参考后判断

# ── 查看最近判别记录 ────────────────────────────────────────────
Write-Host "`n========== 最近判别结果汇总 ==========" -ForegroundColor Cyan
$verdicts = Invoke-RestMethod -Uri "$BASE/verdicts?limit=10" -Method GET
$verdicts | ForEach-Object {
    $color = switch ($_.identity) {
        "CUSTOMER"   { "Green"   }
        "COMPETITOR" { "Red"     }
        "UNKNOWN"    { "Magenta" }
        default      { "Yellow"  }
    }
    Write-Host ("  {0,-20} {1,-12} {2,-10} conf={3:P0}  by={4}" -f
        ($_.company -replace '.{0}',''),
        "$($_.identity)/$($_.relationship)",
        $(if ($_.needsReview) {"⚠️ 待确认"} else {"✅ 已确认"}),
        $_.confidence,
        $_.decidedBy
    ) -ForegroundColor $color
}
