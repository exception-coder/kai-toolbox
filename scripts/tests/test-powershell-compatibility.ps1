param([switch]$ParseOnly)

$ErrorActionPreference = 'Stop'
$scriptsRoot = Split-Path -Parent $PSScriptRoot
$scriptFiles = Get-ChildItem -LiteralPath $scriptsRoot -Recurse -Filter '*.ps1' -File

function Assert-ScriptsParse {
    foreach ($scriptFile in $scriptFiles) {
        $tokens = $null
        $parseErrors = $null
        [System.Management.Automation.Language.Parser]::ParseFile(
            $scriptFile.FullName,
            [ref]$tokens,
            [ref]$parseErrors
        ) | Out-Null
        if ($parseErrors.Count -gt 0) {
            $details = $parseErrors | ForEach-Object {
                '{0}:{1}: {2}' -f $scriptFile.FullName, $_.Extent.StartLineNumber, $_.Message
            }
            throw ($details -join [Environment]::NewLine)
        }
    }
}

if ($ParseOnly) {
    Assert-ScriptsParse
    Write-Host "[powershell-compat] parsed $($scriptFiles.Count) scripts with $($PSVersionTable.PSVersion)"
    exit 0
}

$strictUtf8 = New-Object System.Text.UTF8Encoding($false, $true)
foreach ($scriptFile in $scriptFiles) {
    $bytes = [System.IO.File]::ReadAllBytes($scriptFile.FullName)
    try {
        $text = $strictUtf8.GetString($bytes)
    } catch {
        throw "PowerShell script is not valid UTF-8: $($scriptFile.FullName)"
    }
    $hasUtf8Bom = $bytes.Length -ge 3 `
        -and $bytes[0] -eq 0xEF `
        -and $bytes[1] -eq 0xBB `
        -and $bytes[2] -eq 0xBF
    if ($text -match '[^\x00-\x7F]' -and -not $hasUtf8Bom) {
        throw "PowerShell script contains non-ASCII text but has no UTF-8 BOM: $($scriptFile.FullName)"
    }
}

$runtimePaths = @('powershell.exe', 'pwsh.exe') |
    ForEach-Object { Get-Command $_ -ErrorAction SilentlyContinue } |
    Where-Object { $null -ne $_ } |
    Select-Object -ExpandProperty Source -Unique
if ($runtimePaths.Count -eq 0) {
    throw 'No PowerShell runtime is available for compatibility validation.'
}

foreach ($runtimePath in $runtimePaths) {
    & $runtimePath -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $PSCommandPath -ParseOnly
    if ($LASTEXITCODE -ne 0) {
        throw "PowerShell compatibility validation failed: $runtimePath"
    }
}

Write-Host "[powershell-compat] UTF-8 and parser checks passed for $($scriptFiles.Count) scripts"
