<#
.SYNOPSIS
    从 fore-consult 的人工裁决记录回捞 tool-eval 黄金集（场景 ② EXTRACTION）。

.DESCRIPTION
    consult_bug 里 status=CONFIRMED / REJECTED 的行是天然带标注的语料：
      CONFIRMED —— AI 判定是缺陷，人工复核认可  -> 期望 isBug=true
      REJECTED  —— AI 判定是缺陷，人工复核驳回  -> 期望 isBug=false（防误报的负样本，最珍贵）
    两者都经过人工裁决，不需要再标一遍。

    数据源刻意选 consult_bug 而非 consult_turn：consult_turn.answer 存的是**未剥离**的原文，
    里面还嵌着 AI 自己输出的 <<<BUG_REPORT>>> 块。拿它当输入等于把答案抄给被测模型，
    评测会虚高到没有意义。consult_bug.answer 是前端 stripBug 后的正文，才是干净输入。

    幂等：sourceRef=consult_bug:<bugId>，重复执行只会 skipped，不会重复建用例
    （后端 /cases/import 按 sourceRef 跳过，DB 侧另有偏唯一索引兜底）。

.PARAMETER Token
    访问令牌。后端 JwtAuthFilter 认 Authorization: Bearer，也认 access_token 查询参数。
    未显式传入时回落到环境变量 KAI_TOOLBOX_TOKEN。

.PARAMETER DryRun
    只打印将要导入的用例，不调用导入接口。首次回捞建议先跑一次 -DryRun 抽查几条。

.EXAMPLE
    .\harvest-eval-golden.ps1 -Token $env:KAI_TOOLBOX_TOKEN -DryRun
    .\harvest-eval-golden.ps1 -Token $env:KAI_TOOLBOX_TOKEN -Dataset bug-extract-v1

.NOTES
    覆盖面局限（看报告时务必记得）：consult_bug 里只有「AI 主动报了缺陷」的轮次，
    AI 漏报（真有 BUG 但没输出块）的轮次根本不在表里，回捞不到。
    因此本数据集能衡量「误报是否变多、原本抓到的是否还抓得到」，
    但衡量不了「模型对全量咨询的真实召回」。补漏报样本需要人工从 consult_turn 挑，暂未自动化。
#>
[CmdletBinding()]
param(
    [string]$BaseUrl = 'http://localhost:8080',
    [string]$Token = $env:KAI_TOOLBOX_TOKEN,
    [string]$Dataset = 'bug-extract-v1',
    [int]$Limit = 1000,
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

if (-not $Token) {
    Write-Error "缺少访问令牌：传 -Token 或设置环境变量 KAI_TOOLBOX_TOKEN。`n在浏览器已登录的工作台里从 localStorage 取 access_token 即可。"
}

$headers = @{ Authorization = "Bearer $Token" }

# ---- 1. 拉取人工已裁决的缺陷 ----------------------------------------------
$listUrl = "$BaseUrl/api/fore-consult/bugs?status=CONFIRMED&status=REJECTED&limit=$Limit"
Write-Host "拉取已裁决缺陷: $listUrl" -ForegroundColor Cyan
try {
    $bugs = Invoke-RestMethod -Uri $listUrl -Headers $headers -Method Get
} catch {
    Write-Error "拉取失败（后端没起？令牌过期？）: $($_.Exception.Message)"
}

if (-not $bugs) {
    Write-Host "没有 CONFIRMED / REJECTED 记录，无可回捞。" -ForegroundColor Yellow
    Write-Host "先在「业务系统咨询」里把 NEW 的缺陷人工核实成 CONFIRMED 或 REJECTED，再跑本脚本。" -ForegroundColor Yellow
    return
}
# 单条结果会被反序列化成非数组，统一成数组
$bugs = @($bugs)
Write-Host "取得 $($bugs.Count) 条已裁决记录" -ForegroundColor Green

# ---- 2. 转成 eval 用例 ------------------------------------------------------
function ConvertTo-EvalCase {
    param($Bug, [string]$Dataset)

    $question = if ($Bug.question) { [string]$Bug.question } else { '' }
    $answer = if ($Bug.answer) { [string]$Bug.answer } else { '' }
    # BugExtractionAdapter 要求 question / answer 至少有一个非空，否则整条 ERROR
    if (-not $question.Trim() -and -not $answer.Trim()) { return $null }

    $isBug = ($Bug.status -eq 'CONFIRMED')

    if ($isBug) {
        # 期望值只保留 adapter normalize 后会产出的字段，多写的字段推导不出断言反而是噪声。
        # title 属自由文本，断言层会自动降级成 NON_NULL，不做相等判定。
        $expected = [ordered]@{
            isBug    = $true
            type     = $Bug.type
            severity = $Bug.severity
            system   = $Bug.systemName
            module   = $Bug.module
            title    = $Bug.title
        }
    } else {
        # 负样本：显式把其余字段写成 null，断言层据此推导 ABSENT，
        # 用来抓「不该抽的却抽出来了」——只断言 isBug=false 是抓不到的。
        $expected = [ordered]@{
            isBug    = $false
            type     = $null
            severity = $null
            system   = $null
            module   = $null
            title    = $null
        }
    }

    $title = "[$($Bug.status)] $($Bug.title)"
    if ($title.Length -gt 200) { $title = $title.Substring(0, 200) }

    return [ordered]@{
        scenario     = 'EXTRACTION'
        dataset      = $Dataset
        title        = $title
        inputJson    = ([ordered]@{ question = $question; answer = $answer } | ConvertTo-Json -Depth 5 -Compress)
        expectedJson = ($expected | ConvertTo-Json -Depth 5 -Compress)
        tags         = (@('harvested', $Bug.status) | ConvertTo-Json -Compress)
        sourceRef    = "consult_bug:$($Bug.bugId)"
        enabled      = $true
    }
}

$cases = @()
$skippedEmpty = 0
foreach ($b in $bugs) {
    $c = ConvertTo-EvalCase -Bug $b -Dataset $Dataset
    if ($null -eq $c) { $skippedEmpty++; continue }
    $cases += $c
}

$confirmed = @($bugs | Where-Object { $_.status -eq 'CONFIRMED' }).Count
$rejected = @($bugs | Where-Object { $_.status -eq 'REJECTED' }).Count
Write-Host "可导入 $($cases.Count) 条（正样本 CONFIRMED=$confirmed / 负样本 REJECTED=$rejected）" -ForegroundColor Green
if ($skippedEmpty -gt 0) {
    Write-Host "跳过 $skippedEmpty 条：question 与 answer 均为空，喂给 adapter 只会变成 ERROR。" -ForegroundColor Yellow
}
if ($rejected -eq 0) {
    Write-Host "警告：一条负样本都没有。全是正样本的数据集测不出「误报变多」，模型只要一律答 isBug=true 就能满分。" -ForegroundColor Yellow
}
if ($cases.Count -eq 0) { return }

# ---- 3. 导入（幂等） --------------------------------------------------------
if ($DryRun) {
    Write-Host "`n--- DryRun，未写入。前 3 条预览： ---" -ForegroundColor Cyan
    $cases | Select-Object -First 3 | ConvertTo-Json -Depth 6 | Write-Host
    return
}

$body = ConvertTo-Json -InputObject @($cases) -Depth 6
$importUrl = "$BaseUrl/api/eval/cases/import"
Write-Host "导入: $importUrl" -ForegroundColor Cyan
try {
    $resp = Invoke-RestMethod -Uri $importUrl -Headers $headers -Method Post `
        -ContentType 'application/json; charset=utf-8' `
        -Body ([System.Text.Encoding]::UTF8.GetBytes($body))
} catch {
    Write-Error "导入失败（整批回滚，未写入任何一条）: $($_.Exception.Message)"
}

Write-Host "完成：received=$($resp.received) created=$($resp.created) skipped=$($resp.skipped)" -ForegroundColor Green
if ($resp.skipped -gt 0) {
    Write-Host "skipped 是按 sourceRef 命中的已有用例，重复回捞的正常结果。" -ForegroundColor DarkGray
}
Write-Host "下一步：工作台 -> 回归评测 -> 选 adapter=bug-extraction、dataset=$Dataset 跑首轮基线。" -ForegroundColor Cyan
