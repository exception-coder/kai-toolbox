# kai-toolbox one-click supervisor (backend + frontend) with HTTP control endpoint
#
# Responsibilities:
#   1) Free the target ports first (kill any process holding 18080 / 5173 / 18081),
#      then start OUR backend + frontend — a clean takeover every launch.
#   2) Supervise both: restart whichever exits/crashes.
#        - backend  : packaged jar (mvn package -Dskip.frontend=true, then java -jar) on :18080
#        - frontend : Vite dev server (npm run dev) on :5173, proxies /api -> :18080
#   3) Keep an independent HTTP control endpoint on 127.0.0.1:18081:
#        POST /restart   requires X-Restart-Token or ?token=  (restarts backend only)
#        GET  /status    reports backend health, PID, and last start time
#
# The frontend restart button calls this endpoint through the Vite /supervisor proxy.
# The jar build keeps -Dskip.frontend=true because the dev frontend runs separately via Vite.
#
# Usage:
#   pwsh -File scripts\run-supervised.ps1
# Ctrl+C stops the supervisor loop AND both child processes.

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

# ── Tool & config resolution (config file → auto-detect → interactive → 写回) ───
# 同目录 run-tools.conf 以 KEY=路径 记录本机工具位置。解析顺序：
#   1) 配置文件命中且路径有效 → 用它
#   2) 否则自动探测：同名环境变量 → PATH → 已知回退；命中即写回配置
#   3) 可选工具探测不到 → $null
#   4) 必需工具仍找不到 → 交互式询问，用户填入后写回配置（下次免问）
$ToolsConfFile = Join-Path $PSScriptRoot 'run-tools.conf'

function Read-ConfValue([string]$key) {
    if (-not (Test-Path $ToolsConfFile)) { return $null }
    foreach ($line in [System.IO.File]::ReadAllLines($ToolsConfFile)) {
        $t = $line.Trim()
        if ($t -eq '' -or $t.StartsWith('#')) { continue }
        $i = $t.IndexOf('=')
        if ($i -lt 1) { continue }
        if ($t.Substring(0, $i).Trim() -eq $key) { return $t.Substring($i + 1).Trim() }
    }
    return $null
}

function Write-ConfValue([string]$key, [string]$value) {
    $out = New-Object System.Collections.Generic.List[string]
    $found = $false
    if (Test-Path $ToolsConfFile) {
        foreach ($line in [System.IO.File]::ReadAllLines($ToolsConfFile)) {
            $t = $line.Trim()
            if ($t -and -not $t.StartsWith('#')) {
                $i = $t.IndexOf('=')
                if ($i -ge 1 -and $t.Substring(0, $i).Trim() -eq $key) {
                    $out.Add("$key=$value"); $found = $true; continue
                }
            }
            $out.Add($line)
        }
    } else {
        $out.Add('# kai-toolbox 本机工具路径配置（脚本自动维护，可手改）')
        $out.Add('# 形如 KEY=路径；缺失或失效时脚本会交互式询问并写回这里。')
        $out.Add('# 机器相关，建议不要提交到仓库。')
        $out.Add('')
    }
    if (-not $found) { $out.Add("$key=$value") }
    [System.IO.File]::WriteAllText($ToolsConfFile, ($out -join "`r`n") + "`r`n", [System.Text.UTF8Encoding]::new($false))
    Write-Host "[supervisor] 已写回 $($ToolsConfFile | Split-Path -Leaf)：$key=$value"
}

# 把用户给的路径规整成真正的可执行文件：已是文件→原样；是目录→在 <dir> 和 <dir>\bin
# 下找 <name>.cmd/.bat/.exe/<name>（这样用户填 Maven 主目录也能自动定位到 bin\mvn.cmd）。
# 找不到可执行文件返回 $null。
function Resolve-ExePath([string]$path, [string]$name) {
    if (-not $path) { return $null }
    if (Test-Path -LiteralPath $path -PathType Leaf) { return $path }
    if (Test-Path -LiteralPath $path -PathType Container) {
        foreach ($d in @($path, (Join-Path $path 'bin'))) {
            foreach ($ext in @('.cmd', '.bat', '.exe', '')) {
                $cand = Join-Path $d ($name + $ext)
                if (Test-Path -LiteralPath $cand -PathType Leaf) { return $cand }
            }
        }
    }
    return $null
}

function Resolve-Tool {
    param(
        [string]$Display,      # 显示名，如 'Maven (mvn.cmd)'
        [string]$Key,          # 配置键 = 环境变量名（如 MVN_CMD）
        [string]$OnPath,       # PATH 上的命令名，如 'mvn'
        [string[]]$Fallbacks,  # 已知安装回退路径
        [string[]]$ExtraEnv,   # 额外兼容的环境变量名（如 aria2 的 TOOLBOX_ARIA2_BINARY）
        [switch]$Optional      # 可选工具：探测不到返回 $null，不提示
    )
    # 1) 配置文件：值可能是可执行文件，也可能是主目录——都规整成真正的 exe；规整后与原值不同则写回
    $v = Read-ConfValue $Key
    if ($v) {
        $r = Resolve-ExePath $v $OnPath
        if ($r) { if ($r -ne $v) { Write-ConfValue $Key $r }; return $r }
        Write-Host "[supervisor] 配置中的 $Key 不是可用的可执行文件，重新探测：$v"
    }
    # 2) 自动探测：环境变量 → PATH → 回退路径；命中即写回配置
    $auto = $null
    foreach ($en in (@($Key) + @($ExtraEnv))) {
        if (-not $en) { continue }
        $r = Resolve-ExePath ([Environment]::GetEnvironmentVariable($en)) $OnPath
        if ($r) { $auto = $r; break }
    }
    if (-not $auto) { $c = Get-Command $OnPath -ErrorAction SilentlyContinue; if ($c) { $auto = $c.Source } }
    if (-not $auto) { foreach ($p in $Fallbacks) { $r = Resolve-ExePath $p $OnPath; if ($r) { $auto = $r; break } } }
    if ($auto) { Write-ConfValue $Key $auto; return $auto }
    # 3) 可选工具：探测不到返回 $null
    if ($Optional) { return $null }
    # 4) 交互式询问 → 写回配置（可填可执行文件或其所在主目录）
    while ($true) {
        Write-Host ''
        Write-Host "[supervisor] 未找到必需的 $Display。"
        Write-Host "[supervisor]   请输入其可执行文件或所在主目录的完整路径；或加入 PATH 后直接回车重新探测；输入 q 退出。"
        Write-Host "[supervisor]   （填入后写回 run-tools.conf 的 $Key，下次免问）"
        $answer = Read-Host "  $Display 路径"
        if ($answer -eq 'q') { Write-Host '[supervisor] 已取消启动。'; exit 1 }
        if ([string]::IsNullOrWhiteSpace($answer)) {
            $c = Get-Command $OnPath -ErrorAction SilentlyContinue
            if ($c) { Write-ConfValue $Key $c.Source; return $c.Source }
            Write-Host "[supervisor] 仍未探测到 $Display。"
            continue
        }
        $r = Resolve-ExePath $answer $OnPath
        if ($r) { Write-ConfValue $Key $r; return $r }
        Write-Host "[supervisor] 没找到可执行文件（已试 $answer 及其 bin 下的 $OnPath.cmd/.exe）：$answer"
    }
}

# 读 java -version 的主版本号（1.8→8；21→21）。读不到返回 0。
function Get-JavaMajor([string]$javaExe) {
    try {
        $out = & $javaExe -version 2>&1 | Out-String
        if ($out -match 'version "(\d+)(\.(\d+))?') {
            $maj = [int]$Matches[1]
            if ($maj -eq 1 -and $Matches[3]) { return [int]$Matches[3] }
            return $maj
        }
    } catch {}
    return 0
}

# Java 版本守门：低于 17 则交互式让用户改指 Java 21（回车=仍用当前继续；q 退出）。改了就写回配置。
function Confirm-JavaVersion([string]$javaExe) {
    $needed = 21
    while ($true) {
        $maj = Get-JavaMajor $javaExe
        if ($maj -ge 17) {
            if ($maj -lt $needed) { Write-Host "[supervisor] 注意：检测到 Java $maj，项目建议 Java $needed。" }
            return $javaExe
        }
        Write-Host ''
        Write-Host "[supervisor] 当前 java 版本为 $maj，过低（Spring Boot 3.4 需 Java 17+，项目用 $needed）。"
        Write-Host "[supervisor]   请输入一个 Java $needed 的 java.exe 完整路径；回车=仍用当前并继续（可能启动失败）；q 退出。"
        $answer = Read-Host '  Java 路径'
        if ($answer -eq 'q') { Write-Host '[supervisor] 已取消启动。'; exit 1 }
        if ([string]::IsNullOrWhiteSpace($answer)) { return $javaExe }
        if (Test-Path $answer) { $javaExe = $answer; Write-ConfValue 'JAVA_CMD' $answer } else { Write-Host "[supervisor] 路径不存在：$answer" }
    }
}

$MvnCmd = Resolve-Tool -Display 'Maven (mvn.cmd)' -Key 'MVN_CMD' -OnPath 'mvn' -Fallbacks @(
    'D:\devapps\apache-maven-3.9.9\bin\mvn.cmd',
    'C:\Program Files\apache-maven\bin\mvn.cmd'
)

$JavaCmd = Resolve-Tool -Display 'Java (java.exe)' -Key 'JAVA_CMD' -OnPath 'java' -Fallbacks @(
    $(if ($env:JAVA_HOME) { Join-Path $env:JAVA_HOME 'bin\java.exe' } else { $null })
)
$JavaCmd = Confirm-JavaVersion $JavaCmd
# 关键：mvn 构建用的是 JAVA_HOME（不是上面解析的 java.exe）。本机默认 JAVA_HOME 可能仍指向旧 JDK，
# 会把 Java 21 项目用 JDK 8 编译而失败。这里据 JavaCmd 反推 JDK 主目录并覆盖 JAVA_HOME，
# 子进程的 mvn / java 都继承它。
if ($JavaCmd -match '[\\/]bin[\\/]java(\.exe)?$') {
    $env:JAVA_HOME = Split-Path -Parent (Split-Path -Parent $JavaCmd)
    Write-Host "[supervisor] JAVA_HOME=$env:JAVA_HOME （供 mvn 构建使用 JDK 21）"
}

# npm：前端 dev 与两个 node sidecar 的初始化都要它（子 shell 里直接调 `npm`）。
# 解析后把其所在目录前置进 PATH，确保 spawn 出去的 powershell 子进程也能找到。
$NpmCmd = Resolve-Tool -Display 'npm' -Key 'NPM_CMD' -OnPath 'npm' -Fallbacks @(
    'D:\Program Files\nodejs\npm.cmd',
    'C:\Program Files\nodejs\npm.cmd'
)
$npmDir = Split-Path -Parent $NpmCmd
if ($npmDir -and (";$env:PATH;" -notlike "*;$npmDir;*")) { $env:PATH = "$npmDir;$env:PATH" }

# aria2 可选：找不到就不提示、不传 -DTOOLBOX_ARIA2_BINARY（仅下载器工具受影响，不挡后端启动）。
$Aria2Bin = Resolve-Tool -Display 'aria2c' -Key 'ARIA2_BIN' -OnPath 'aria2c' -Fallbacks @(
    'D:\devapps\aria2-1.37.0-win-64bit-build1\aria2c.exe'
) -ExtraEnv @('TOOLBOX_ARIA2_BINARY') -Optional

# 机器/密钥相关项：默认沿用原值，但都可用环境变量覆盖（不再钉死在脚本里）。
$QbtPassword  = if ($env:TOOLBOX_QBT_PASSWORD)         { $env:TOOLBOX_QBT_PASSWORD }         else { 'KE5RWmYs4' }
$HttpProxy    = if ($env:TOOLBOX_HTTP_PROXY)           { $env:TOOLBOX_HTTP_PROXY }           else { 'http://127.0.0.1:7897' }
$SysRestartTk = if ($env:TOOLBOX_SYSTEM_RESTART_TOKEN) { $env:TOOLBOX_SYSTEM_RESTART_TOKEN } else { 'zhangk2026' }
$WhisperMode  = if ($env:TOOLBOX_WHISPER_MODE)         { $env:TOOLBOX_WHISPER_MODE }         else { 'asr-service' }

# Playwright/patchright 浏览器内核下载走国内镜像：官方 CDN 在境内常被掐 TLS，导致
# media-parser 的 Playwright-Java 自动装 Chromium、以及 undetected-browser 的 install-browser 失败。
# 设为进程级环境变量，后端与 npm 初始化的子进程都继承。已自定义则不覆盖。
if (-not $env:PLAYWRIGHT_DOWNLOAD_HOST) { $env:PLAYWRIGHT_DOWNLOAD_HOST = 'https://cdn.npmmirror.com/binaries/playwright' }

# Configure restart token. Empty token rejects all /restart requests.
$RestartToken = 'kai-restart-2026'

$HttpPrefix = 'http://127.0.0.1:18081/'

# Control endpoint port (the HttpListener above). Freed on startup to take over a stale supervisor.
$ControlPort = 18081

# Backend port. Must match server.port in application.yml.
$BackendPort = 18080

# Frontend dev server port. Must match server.port in frontend/vite.config.ts.
$FrontendPort = 5173

$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

# Marks backend children as supervisor-owned so SupervisorBootstrap avoids loops.
$env:KAI_SUPERVISED = '1'

# UTF-8 bootstrap re-applied inside each spawned child shell (keeps Chinese logs readable).
$script:Utf8SubshellCommand = "chcp.com 65001 > `$null; `$utf8Encoding = [System.Text.UTF8Encoding]::new(`$false); [Console]::InputEncoding = `$utf8Encoding; [Console]::OutputEncoding = `$utf8Encoding; `$global:OutputEncoding = `$utf8Encoding"

$script:backend = $null
$script:frontend = $null
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
    $javaOptions = @()
    # aria2 找到才传（缺失不挡后端启动）
    if ($Aria2Bin) { $javaOptions += "-DTOOLBOX_ARIA2_BINARY=$Aria2Bin" }
    $javaOptions += @(
        "-DTOOLBOX_QBT_PASSWORD=$QbtPassword",
        "-DTOOLBOX_HTTP_PROXY=$HttpProxy",
        "-DTOOLBOX_SYSTEM_RESTART_TOKEN=$SysRestartTk",
        '-Dfile.encoding=UTF-8',
        '-Dstdout.encoding=UTF-8',
        '-Dstderr.encoding=UTF-8',
        "-Dtoolbox.whisper.mode=$WhisperMode"
    )
    $mvnLiteral = Quote-PowerShellLiteral $MvnCmd
    $javaLiteral = Quote-PowerShellLiteral $JavaCmd
    $javaOptionsLiteral = ($javaOptions | ForEach-Object { Quote-PowerShellLiteral $_ }) -join ' '
    $jarLiteral = Quote-PowerShellLiteral $starterJar
    $runCommand = "$script:Utf8SubshellCommand; & $mvnLiteral -pl toolbox-starter -am '-Dskip.frontend=true' package; if (`$LASTEXITCODE -ne 0) { exit `$LASTEXITCODE }; & $javaLiteral $javaOptionsLiteral -jar $jarLiteral"
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

function Start-Frontend {
    Stop-PortHolders $FrontendPort
    Write-Host "[supervisor] $(Get-Date -Format 'HH:mm:ss') start frontend dev server (vite :$FrontendPort)..."
    $frontendDir = Join-Path $RepoRoot 'frontend'
    $frontendDirLiteral = Quote-PowerShellLiteral $frontendDir
    # First run installs deps; subsequent runs skip it. npm run dev = Vite on :5173 (proxies /api -> backend).
    $runCommand = "$script:Utf8SubshellCommand; Set-Location $frontendDirLiteral; if (-not (Test-Path 'node_modules')) { npm install --no-audit --no-fund }; npm run dev"
    $script:frontend = Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') `
        -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', $runCommand) `
        -PassThru -NoNewWindow
}

function Stop-Frontend {
    if ($script:frontend -and -not $script:frontend.HasExited) {
        # npm spawns node/esbuild children, so stop the whole process tree.
        & taskkill /PID $script:frontend.Id /T /F 2>&1 | Out-Null
    }
}

# One-time, idempotent init of the two node sidecars the backend lazily spawns.
# The backend OWNS the processes (claude-chat: node dist/server.js; browser-request
# undetected-node engine: node server.js) — we only make sure their deps exist so
# those lazy spawns actually work. Already-built / already-installed => skip (no daily slowdown).
function Initialize-NodeDeps {
    if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
        Write-Host "[supervisor] npm not on PATH, skip node sidecar init (claude-chat / undetected-node engine will be unavailable)"
        return
    }

    # 1) claude-agent sidecar (claude-chat) — needs dist/server.js (tsc build). Cheap, core feature.
    $sidecar = Join-Path $RepoRoot 'sidecar\claude-agent'
    if (-not (Test-Path (Join-Path $sidecar 'dist\server.js'))) {
        Write-Host "[supervisor] init claude-agent sidecar (npm install + build)..."
        Push-Location $sidecar
        try {
            if (-not (Test-Path 'node_modules')) { & npm install --no-audit --no-fund }
            & npm run build
            if ($LASTEXITCODE -ne 0) { Write-Host "[supervisor] WARN: claude-agent build failed; claude-chat may not start" }
        } catch {
            Write-Host "[supervisor] WARN: claude-agent init error: $($_.Exception.Message)"
        } finally { Pop-Location }
    } else {
        Write-Host "[supervisor] claude-agent sidecar already built, skip"
    }

    # 2) undetected-browser (browser-request undetected-node engine) — needs node_modules
    #    (patchright) + a patched chromium kernel. First run downloads ~150MB; then skipped.
    $undetected = Join-Path $RepoRoot 'node-services\undetected-browser'
    if (-not (Test-Path (Join-Path $undetected 'node_modules'))) {
        Write-Host "[supervisor] init undetected-browser (npm install + install-browser, ~150MB chromium, first run only)..."
        Push-Location $undetected
        try {
            & npm install --no-audit --no-fund
            if ($LASTEXITCODE -eq 0) {
                & npm run install-browser
                if ($LASTEXITCODE -ne 0) { Write-Host "[supervisor] WARN: chromium install failed; undetected-node engine unavailable" }
            } else {
                Write-Host "[supervisor] WARN: undetected-browser npm install failed; undetected-node engine unavailable"
            }
        } catch {
            Write-Host "[supervisor] WARN: undetected-browser init error: $($_.Exception.Message)"
        } finally { Pop-Location }
    } else {
        Write-Host "[supervisor] undetected-browser deps present, skip"
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

# Take over a stale supervisor still holding the control port, so listener.Start() below succeeds.
Stop-PortHolders $ControlPort

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

# Supervises one child: restart it (after 2s) if it has exited. Returns nothing.
function Watch-Child([string]$name, [scriptblock]$alive, [scriptblock]$restart) {
    if (-not (& $alive)) {
        Write-Host "[supervisor] $(Get-Date -Format 'HH:mm:ss') $name exited, restart after 2s"
        Start-Sleep -Seconds 2
        & $restart
    }
}

$backendAlive  = { $script:backend  -and -not $script:backend.HasExited }
$frontendAlive = { $script:frontend -and -not $script:frontend.HasExited }

# Ensure the node sidecars are initialized before the backend may lazily spawn them.
Initialize-NodeDeps

# One-click start: backend + frontend together.
Start-Backend
Start-Frontend

try {
    if ($listener) {
        $ctxTask = $listener.GetContextAsync()
        while ($true) {
            if ($ctxTask.Wait(1000)) {
                try { Handle-Request $ctxTask.Result } catch { Write-Host "[supervisor] request handling error: $($_.Exception.Message)" }
                $ctxTask = $listener.GetContextAsync()
            }
            Watch-Child 'backend'  $backendAlive  { Start-Backend }
            Watch-Child 'frontend' $frontendAlive { Start-Frontend }
        }
    } else {
        # No control endpoint: supervise only.
        while ($true) {
            Watch-Child 'backend'  $backendAlive  { Start-Backend }
            Watch-Child 'frontend' $frontendAlive { Start-Frontend }
            Start-Sleep -Seconds 1
        }
    }
} finally {
    # Ctrl+C / terminating error: bring both children down so ports are released.
    Write-Host "[supervisor] shutting down, stopping frontend + backend..."
    Stop-Frontend
    Stop-Backend
}
