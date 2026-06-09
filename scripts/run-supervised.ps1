# kai-toolbox backend supervisor with HTTP control endpoint
#
# Responsibilities:
#   1) Supervise backend with mvn spring-boot:run. Restart after exit or crash.
#   2) Keep an independent HTTP control endpoint on 127.0.0.1:18081:
#        POST /restart   requires X-Restart-Token or ?token=
#        GET  /status    reports backend health, PID, and last start time
#
# The frontend restart button calls this endpoint through the Vite /supervisor proxy.
# Frontend dev server is not managed here, so -Dskip.frontend=true is used.
#
# Usage:
#   pwsh -File scripts\run-supervised.ps1
# Ctrl+C stops the supervisor loop.

$ErrorActionPreference = 'Continue'

function Initialize-Utf8Console {
    try {
        chcp.com 65001 > $null
        $utf8Encoding = [System.Text.UTF8Encoding]::new($false)
        [Console]::InputEncoding = $utf8Encoding
        [Console]::OutputEncoding = $utf8Encoding
        $global:OutputEncoding = $utf8Encoding
    } catch {
        Write-Host "[supervisor] UTF-8 console setup failed: $($_.Exception.Message)"
    }
}

Initialize-Utf8Console

# Configure the full mvn.cmd path. Leave blank to use mvn from PATH.
$MvnCmd = 'D:\devapps\apache-maven-3.9.9\bin\mvn.cmd'   # Example: 'D:\apps\apache-maven-3.9.9\bin\mvn.cmd'
if ([string]::IsNullOrWhiteSpace($MvnCmd)) { $MvnCmd = 'mvn' }

# Configure restart token. Empty token rejects all /restart requests.
$RestartToken = 'kai-restart-2026'

$HttpPrefix = 'http://127.0.0.1:18081/'

# Backend port. Must match server.port in application.yml.
$BackendPort = 18080

$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

# Marks backend children as supervisor-owned so SupervisorBootstrap avoids loops.
$env:KAI_SUPERVISED = '1'

$script:backend = $null
$script:lastStart = $null

# Stops all process trees that listen on the target port.
function Stop-PortHolders([int]$port) {
    $pids = @()
    try {
        $pids = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction Stop |
                Select-Object -ExpandProperty OwningProcess -Unique
    } catch {
        # Fall back to netstat when Get-NetTCPConnection is unavailable.
        foreach ($l in (netstat -ano | Select-String ":$port\s.*LISTENING")) {
            $tok = ($l.ToString().Trim() -split '\s+')[-1]
            if ($tok -match '^\d+$') { $pids += [int]$tok }
        }
    }
    foreach ($procId in ($pids | Where-Object { $_ -and $_ -ne 0 } | Select-Object -Unique)) {
        Write-Host "[supervisor] takeover: stop process on :$port PID=$procId"
        & taskkill /PID $procId /T /F 2>&1 | Out-Null
    }
}

function Quote-PowerShellLiteral([string]$value) {
    return "'" + $value.Replace("'", "''") + "'"
}

function Start-Backend {
    Stop-PortHolders $BackendPort
    Write-Host "[supervisor] $(Get-Date -Format 'HH:mm:ss') package and start backend..."
    $starterJar = Join-Path $RepoRoot 'toolbox-starter\target\kai-toolbox.jar'
    $javaOptions = @(
        '-DTOOLBOX_ARIA2_BINARY=D:\devapps\aria2-1.37.0-win-64bit-build1\aria2c.exe',
        '-DTOOLBOX_QBT_PASSWORD=KE5RWmYs4',
        '-DTOOLBOX_HTTP_PROXY=http://127.0.0.1:7897',
        '-DTOOLBOX_SYSTEM_RESTART_TOKEN=zhangk2026',
        '-Dfile.encoding=UTF-8',
        '-Dstdout.encoding=UTF-8',
        '-Dstderr.encoding=UTF-8',
        '-Dtoolbox.whisper.mode=asr-service'
    )
    $mvnLiteral = Quote-PowerShellLiteral $MvnCmd
    $javaOptionsLiteral = ($javaOptions | ForEach-Object { Quote-PowerShellLiteral $_ }) -join ' '
    $jarLiteral = Quote-PowerShellLiteral $starterJar
    $utf8Command = "chcp.com 65001 > `$null; `$utf8Encoding = [System.Text.UTF8Encoding]::new(`$false); [Console]::InputEncoding = `$utf8Encoding; [Console]::OutputEncoding = `$utf8Encoding; `$global:OutputEncoding = `$utf8Encoding"
    $runCommand = "$utf8Command; & $mvnLiteral -pl toolbox-starter -am '-Dskip.frontend=true' package; if (`$LASTEXITCODE -ne 0) { exit `$LASTEXITCODE }; & java $javaOptionsLiteral -jar $jarLiteral"
    $script:backend = Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') `
        -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', $runCommand) `
        -PassThru -NoNewWindow
    $script:lastStart = Get-Date
}

function Stop-Backend {
    if ($script:backend -and -not $script:backend.HasExited) {
        # mvn spawns java children, so the whole process tree must be stopped.
        & taskkill /PID $script:backend.Id /T /F 2>&1 | Out-Null
    }
}

function Write-Json($res, [int]$code, $obj) {
    $res.StatusCode = $code
    $res.ContentType = 'application/json; charset=utf-8'
    $res.Headers.Add('Access-Control-Allow-Origin', '*')
    $res.Headers.Add('Access-Control-Allow-Headers', 'X-Restart-Token, Content-Type')
    $res.Headers.Add('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    $bytes = [System.Text.Encoding]::UTF8.GetBytes(($obj | ConvertTo-Json -Compress))
    $res.OutputStream.Write($bytes, 0, $bytes.Length)
    $res.Close()
}

function Handle-Request($ctx) {
    $req = $ctx.Request
    $res = $ctx.Response
    $path = $req.Url.AbsolutePath
    $method = $req.HttpMethod
    if ($method -eq 'OPTIONS') { Write-Json $res 204 @{} ; return }

    if ($path -eq '/status' -and $method -eq 'GET') {
        $up = ($null -ne $script:backend) -and (-not $script:backend.HasExited)
        Write-Json $res 200 @{
            backendUp = $up
            pid       = if ($script:backend) { $script:backend.Id } else { $null }
            lastStart = if ($script:lastStart) { $script:lastStart.ToString('s') } else { $null }
        }
        return
    }

    if ($path -eq '/restart' -and $method -eq 'POST') {
        if ([string]::IsNullOrWhiteSpace($RestartToken)) { Write-Json $res 503 @{ error = 'RestartToken is not configured' }; return }
        $token = $req.Headers['X-Restart-Token']
        if ([string]::IsNullOrWhiteSpace($token)) { $token = $req.QueryString['token'] }
        if ($token -ne $RestartToken) { Write-Json $res 403 @{ error = 'token mismatch' }; return }
        Write-Json $res 200 @{ ok = $true; message = 'restart triggered, backend will return soon' }
        Write-Host "[supervisor] $(Get-Date -Format 'HH:mm:ss') /restart received, taking over port and restarting"
        Stop-Backend
        Stop-PortHolders $BackendPort
        return
    }
    Write-Json $res 404 @{ error = 'not found' }
}

$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add($HttpPrefix)
try {
    $listener.Start()
} catch {
    Write-Host "[supervisor] HTTP control endpoint failed: $($_.Exception.Message)"
    Write-Host "[supervisor] If Access Denied, run as admin once: netsh http add urlacl url=$HttpPrefix user=$env:USERNAME"
    Write-Host "[supervisor] Backend supervision continues without HTTP control."
    $listener = $null
}
if ($listener) { Write-Host "[supervisor] HTTP control $HttpPrefix  (POST /restart, GET /status)" }
Write-Host "[supervisor] repo=$RepoRoot  mvn=$MvnCmd"

Start-Backend

if ($listener) {
    $ctxTask = $listener.GetContextAsync()
    while ($true) {
        if ($ctxTask.Wait(1000)) {
            try { Handle-Request $ctxTask.Result } catch { Write-Host "[supervisor] request handling error: $($_.Exception.Message)" }
            $ctxTask = $listener.GetContextAsync()
        }
        if (-not $script:backend -or $script:backend.HasExited) {
            Write-Host "[supervisor] $(Get-Date -Format 'HH:mm:ss') backend exited, restart after 2s"
            Start-Sleep -Seconds 2
            Start-Backend
        }
    }
} else {
    # No control endpoint: supervise only.
    while ($true) {
        if (-not $script:backend -or $script:backend.HasExited) {
            Write-Host "[supervisor] $(Get-Date -Format 'HH:mm:ss') backend exited, restart after 2s"
            Start-Sleep -Seconds 2
            Start-Backend
        }
        Start-Sleep -Seconds 1
    }
}
