param()

$legacyFile = Join-Path $PSScriptRoot 'run-tools.conf'
$targetDirectory = Join-Path $PSScriptRoot 'run-tools.d'
if (-not (Test-Path -LiteralPath $legacyFile)) {
    Write-Host '[config] 无旧 run-tools.conf，无需迁移。'
    exit 0
}

. (Join-Path $PSScriptRoot 'run-tools-config.ps1')
$groups = [ordered]@{
    '10-runtime.conf' = [System.Collections.Generic.List[object]]::new()
    '20-storage.conf' = [System.Collections.Generic.List[object]]::new()
    '30-security.conf' = [System.Collections.Generic.List[object]]::new()
    '40-ai-services.conf' = [System.Collections.Generic.List[object]]::new()
    '50-integrations.conf' = [System.Collections.Generic.List[object]]::new()
    '60-supplier-quote.conf' = [System.Collections.Generic.List[object]]::new()
}

function Select-ConfigGroup([string]$key) {
    if ($key -like 'SUPPLIER_QUOTE_*') { return '60-supplier-quote.conf' }
    if ($key -match '(PASSWORD|TOKEN|SECRET|API_KEY)' -or $key -like 'TOOLBOX_AUTH_*') {
        return '30-security.conf'
    }
    if ($key -match '^(MVN_CMD|JAVA_CMD|NPM_CMD|PYTHON_CMD|GIT_CMD|ARIA2_BIN|PLAYWRIGHT_)') {
        return '10-runtime.conf'
    }
    if ($key -match '(SQLITE|QDRANT|DATA_DIR)') { return '20-storage.conf' }
    if ($key -match '(LLM|WHISPER|AS_STUDIO|OPENAI|ANTHROPIC|GEMINI)') { return '40-ai-services.conf' }
    return '50-integrations.conf'
}

[System.IO.Directory]::CreateDirectory($targetDirectory) | Out-Null
foreach ($entry in Read-ToolboxConfigEntries $legacyFile) {
    $groups[(Select-ConfigGroup $entry.Key)].Add($entry)
}
foreach ($group in $groups.GetEnumerator()) {
    if ($group.Value.Count -eq 0) { continue }
    $content = [System.Collections.Generic.List[string]]::new()
    $content.Add('# 本机私有配置；由 run-tools.conf 迁移生成，禁止提交。')
    $content.Add('')
    foreach ($entry in $group.Value) { $content.Add("$($entry.Key)=$($entry.Value)") }
    [System.IO.File]::WriteAllText((Join-Path $targetDirectory $group.Key),
        ($content -join "`r`n") + "`r`n", [System.Text.UTF8Encoding]::new($false))
}
Move-Item -LiteralPath $legacyFile -Destination (Join-Path $PSScriptRoot 'run-tools.conf.migrated.bak') -Force
Write-Host '[config] 已迁移到 scripts/run-tools.d；旧文件已改名为受 Git 忽略的备份。'
