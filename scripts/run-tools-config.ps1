param()

$script:ToolboxLegacyConfigFile = Join-Path $PSScriptRoot 'run-tools.conf'
$script:ToolboxConfigDirectory = Join-Path $PSScriptRoot 'run-tools.d'
$script:ToolboxRuntimeConfigFile = Join-Path $script:ToolboxConfigDirectory '10-runtime.conf'

function Get-ToolboxConfigFiles {
    $files = @()
    if (Test-Path -LiteralPath $script:ToolboxConfigDirectory -PathType Container) {
        $files += Get-ChildItem -LiteralPath $script:ToolboxConfigDirectory -Filter '*.conf' -File |
            Sort-Object Name | Select-Object -ExpandProperty FullName
    }
    if (Test-Path -LiteralPath $script:ToolboxLegacyConfigFile -PathType Leaf) {
        $files += $script:ToolboxLegacyConfigFile
    }
    return $files
}

function Read-ToolboxConfigEntries([string]$file) {
    foreach ($line in [System.IO.File]::ReadAllLines($file)) {
        $text = $line.Trim()
        if ($text -eq '' -or $text.StartsWith('#')) { continue }
        $separator = $text.IndexOf('=')
        if ($separator -lt 1) { continue }
        $key = $text.Substring(0, $separator).Trim()
        if ($key -notmatch '^[A-Za-z_][A-Za-z0-9_]*$') { continue }
        [pscustomobject]@{ Key = $key; Value = $text.Substring($separator + 1).Trim() }
    }
}

function Import-ToolboxLocalConfig {
    foreach ($file in Get-ToolboxConfigFiles) {
        foreach ($entry in Read-ToolboxConfigEntries $file) {
            if (-not [Environment]::GetEnvironmentVariable($entry.Key, 'Process')) {
                Set-Item -Path "env:$($entry.Key)" -Value $entry.Value
            }
        }
    }
}

function Get-ToolboxLocalConfigValue([string]$key) {
    $processValue = [Environment]::GetEnvironmentVariable($key, 'Process')
    if ($processValue) { return $processValue }
    foreach ($file in Get-ToolboxConfigFiles) {
        $entry = Read-ToolboxConfigEntries $file | Where-Object Key -EQ $key | Select-Object -First 1
        if ($null -ne $entry) { return $entry.Value }
    }
    return $null
}

function Set-ToolboxRuntimeConfigValue([string]$key, [string]$value) {
    [System.IO.Directory]::CreateDirectory($script:ToolboxConfigDirectory) | Out-Null
    $lines = [System.Collections.Generic.List[string]]::new()
    $found = $false
    if (Test-Path -LiteralPath $script:ToolboxRuntimeConfigFile) {
        foreach ($line in [System.IO.File]::ReadAllLines($script:ToolboxRuntimeConfigFile)) {
            $text = $line.Trim()
            $separator = $text.IndexOf('=')
            if ($separator -ge 1 -and $text.Substring(0, $separator).Trim() -eq $key) {
                $lines.Add("$key=$value")
                $found = $true
            } else {
                $lines.Add($line)
            }
        }
    } else {
        $lines.Add('# Local runtime configuration maintained by startup scripts; do not commit.')
        $lines.Add('')
    }
    if (-not $found) { $lines.Add("$key=$value") }
    [System.IO.File]::WriteAllText($script:ToolboxRuntimeConfigFile,
        ($lines -join "`r`n") + "`r`n", [System.Text.UTF8Encoding]::new($false))
}
