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

# 从同目录 run-tools.conf（KEY=value，不提交到仓库）读取本机机密/配置，注入为进程环境变量。
# 已存在的同名环境变量优先，不被覆盖；可对照 run-tools.conf.example 创建本机文件。
$ToolsConfFile = Join-Path $PSScriptRoot 'run-tools.conf'
if (Test-Path -LiteralPath $ToolsConfFile) {
    foreach ($line in [System.IO.File]::ReadAllLines($ToolsConfFile)) {
        $t = $line.Trim()
        if ($t -eq '' -or $t.StartsWith('#')) { continue }
        $i = $t.IndexOf('=')
        if ($i -lt 1) { continue }
        $k = $t.Substring(0, $i).Trim()
        $v = $t.Substring($i + 1).Trim()
        if (-not [Environment]::GetEnvironmentVariable($k, 'Process')) { Set-Item -Path "env:$k" -Value $v }
    }
}

# 工具路径解析：优先 run-tools.conf 注入的 MVN_CMD/JAVA_CMD（上面已读入环境变量），其次 PATH，最后已知回退。
# 接受目录值——自动定位到 bin\mvn.cmd / bin\java.exe（用户填了 Maven/JDK 主目录也能用）。
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
function Resolve-Tool([string]$envVal, [string]$onPath, [string[]]$fallbacks) {
    $r = Resolve-ExePath $envVal $onPath
    if ($r) { return $r }
    $c = Get-Command $onPath -ErrorAction SilentlyContinue
    if ($c) { return $c.Source }
    foreach ($p in $fallbacks) { $r = Resolve-ExePath $p $onPath; if ($r) { return $r } }
    return $null
}

$MvnCmd = Resolve-Tool $env:MVN_CMD 'mvn' @(
    'D:\devApps\apache-maven-3.9.16-bin\apache-maven-3.9.16\bin\mvn.cmd',
    'C:\Program Files\apache-maven\bin\mvn.cmd'
)
if (-not $MvnCmd) { Write-Host '[supervisor] 未找到 Maven：请在 run-tools.conf 配置 MVN_CMD 或把 mvn 加入 PATH。'; $MvnCmd = 'mvn' }

# Java：构建(mvn)和运行(java -jar)都必须用 JDK 21，否则 jar 是 17+ 字节码、PATH 上的旧 JDK 跑不了。
$JavaCmd = Resolve-Tool $env:JAVA_CMD 'java' @(
    $(if ($env:JAVA_HOME) { Join-Path $env:JAVA_HOME 'bin\java.exe' } else { $null })
)
if (-not $JavaCmd) { Write-Host '[supervisor] 未找到 Java：请在 run-tools.conf 配置 JAVA_CMD（需 JDK 21）。'; $JavaCmd = 'java' }
# 据 JavaCmd 反推并覆盖 JAVA_HOME，供 mvn 构建用对 JDK（本机默认 JAVA_HOME 可能是旧 JDK）。
if ($JavaCmd -match '[\\/]bin[\\/]java(\.exe)?$') {
    $env:JAVA_HOME = Split-Path -Parent (Split-Path -Parent $JavaCmd)
    Write-Host "[supervisor] JAVA_HOME=$env:JAVA_HOME"
}
# Playwright/patchright 浏览器内核下载走国内镜像（官方 CDN 境内常被掐 TLS）。
if (-not $env:PLAYWRIGHT_DOWNLOAD_HOST) { $env:PLAYWRIGHT_DOWNLOAD_HOST = 'https://cdn.npmmirror.com/binaries/playwright' }
# npm install 走国内镜像（sidecar 依赖直连 registry.npmjs.org 境内常超时/失败）。已自定义则不覆盖。
if (-not $env:NPM_CONFIG_REGISTRY) { $env:NPM_CONFIG_REGISTRY = 'https://registry.npmmirror.com' }

# 前端 Vite dev 端口（须与 frontend/vite.config.ts 一致）。
$FrontendPort = 5173

# npm：前端 dev 与两个 node sidecar 初始化都要它。优先 conf 注入的 NPM_CMD，其次 PATH；
# 把其所在目录前置进 PATH，确保 spawn 出去的子 powershell 也能直接调 npm。
$NpmCmd = Resolve-Tool $env:NPM_CMD 'npm' @(
    'D:\Program Files\nodejs\npm.cmd',
    'C:\Program Files\nodejs\npm.cmd'
)
if ($NpmCmd) {
    $npmDir = Split-Path -Parent $NpmCmd
    if ($npmDir -and (";$env:PATH;" -notlike "*;$npmDir;*")) { $env:PATH = "$npmDir;$env:PATH" }
} else {
    Write-Host '[supervisor] 未找到 npm：前端与 sidecar 初始化将不可用（在 run-tools.conf 配置 NPM_CMD 或把 npm 加入 PATH）。'
}

# /restart 控制端点的令牌，取自 run-tools.conf 的 TOOLBOX_SUPERVISOR_RESTART_TOKEN。
# 公开仓库禁止硬编码；未配置时令牌为空，/restart 一律拒绝。
$RestartToken = $env:TOOLBOX_SUPERVISOR_RESTART_TOKEN

$HttpPrefix = 'http://127.0.0.1:18081/'

# Backend port. Must match server.port in application.yml.
$BackendPort = 18080

$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

# Marks backend children as supervisor-owned so SupervisorBootstrap avoids loops.
$env:KAI_SUPERVISED = '1'

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

function Resolve-PowerShellExe {
    $currentProcessPath = [System.Diagnostics.Process]::GetCurrentProcess().MainModule.FileName
    if ($currentProcessPath -and (Test-Path -LiteralPath $currentProcessPath)) {
        return $currentProcessPath
    }

    foreach ($candidate in @(
        (Join-Path $PSHOME 'pwsh.exe'),
        (Join-Path $PSHOME 'powershell.exe')
    )) {
        if (Test-Path -LiteralPath $candidate) {
            return $candidate
        }
    }

    foreach ($commandName in @('pwsh', 'powershell')) {
        $command = Get-Command $commandName -ErrorAction SilentlyContinue
        if ($command) {
            return $command.Source
        }
    }

    throw 'No PowerShell executable found for backend child process.'
}

function Start-Backend {
    Stop-PortHolders $BackendPort
    Write-Host "[supervisor] $(Get-Date -Format 'HH:mm:ss') package and start backend..."
    $starterJar = Join-Path $RepoRoot 'toolbox-starter\target\kai-toolbox.jar'
    # 机密项一律取自 run-tools.conf（已注入环境变量），禁止硬编码进脚本（本仓为公开仓库）。
    #   TOOLBOX_QBT_PASSWORD            qBittorrent 密码
    #   TOOLBOX_SYSTEM_RESTART_TOKEN    后端系统级重启令牌
    #   TOOLBOX_QDRANT_HOST / _API_KEY  AI 秘书 RAG 的 Qdrant 地址与 Key（未设 Key 则不启用 RAG）
    $javaOptions = @(
        '-DTOOLBOX_ARIA2_BINARY=D:\devapps\aria2-1.37.0-win-64bit-build1\aria2c.exe',
        '-DTOOLBOX_HTTP_PROXY=http://127.0.0.1:7897',
        '-Dfile.encoding=UTF-8',
        '-Dstdout.encoding=UTF-8',
        '-Dstderr.encoding=UTF-8',
        '-Dtoolbox.whisper.mode=asr-service'
    )
    if ($env:TOOLBOX_QBT_PASSWORD)         { $javaOptions += "-DTOOLBOX_QBT_PASSWORD=$env:TOOLBOX_QBT_PASSWORD" }
    if ($env:TOOLBOX_SYSTEM_RESTART_TOKEN) { $javaOptions += "-DTOOLBOX_SYSTEM_RESTART_TOKEN=$env:TOOLBOX_SYSTEM_RESTART_TOKEN" }
    # AI 秘书向量 RAG：远端 Qdrant + API Key（嵌入仍用本地 Ollama bge-m3，需先 ollama pull bge-m3）
    if ($env:TOOLBOX_QDRANT_API_KEY) {
        $qdrantHost = if ($env:TOOLBOX_QDRANT_HOST) { $env:TOOLBOX_QDRANT_HOST } else { '127.0.0.1' }
        $javaOptions += '-Dtoolbox.ai-secretary.rag.enabled=true'
        $javaOptions += "-Dtoolbox.ai-secretary.rag.qdrant-host=$qdrantHost"
        $javaOptions += '-Dtoolbox.ai-secretary.rag.qdrant-port=6334'
        $javaOptions += "-Dtoolbox.ai-secretary.rag.qdrant-api-key=$env:TOOLBOX_QDRANT_API_KEY"
        # 访客分析向量 RAG：同一套远端 Qdrant + Key（独立集合 va_customers），用于灰区判别的相似客户召回。
        $javaOptions += '-Dtoolbox.visitor-analysis.rag.enabled=true'
        $javaOptions += "-Dtoolbox.visitor-analysis.rag.qdrant-host=$qdrantHost"
        $javaOptions += '-Dtoolbox.visitor-analysis.rag.qdrant-port=6334'
        $javaOptions += "-Dtoolbox.visitor-analysis.rag.qdrant-api-key=$env:TOOLBOX_QDRANT_API_KEY"
    }
    # SQLite DB 文件位置。留空走默认 ${toolbox.data-dir}/toolbox.db；
    # C 盘吃紧时在 run-tools.conf 配 TOOLBOX_SQLITE_FILE 把 DB 单独放大盘（如 D:\kai-toolbox\toolbox.db）。
    if ($env:TOOLBOX_SQLITE_FILE) { $javaOptions += "-Dtoolbox.sqlite.file=$env:TOOLBOX_SQLITE_FILE" }
    $mvnLiteral = Quote-PowerShellLiteral $MvnCmd
    $javaLiteral = Quote-PowerShellLiteral $JavaCmd
    $javaOptionsLiteral = ($javaOptions | ForEach-Object { Quote-PowerShellLiteral $_ }) -join ' '
    $jarLiteral = Quote-PowerShellLiteral $starterJar
    $utf8Command = "chcp.com 65001 > `$null; `$utf8Encoding = [System.Text.UTF8Encoding]::new(`$false); [Console]::InputEncoding = `$utf8Encoding; [Console]::OutputEncoding = `$utf8Encoding; `$global:OutputEncoding = `$utf8Encoding"
    $runCommand = "$utf8Command; & $mvnLiteral -pl toolbox-starter -am '-Dskip.frontend=true' package; if (`$LASTEXITCODE -ne 0) { exit `$LASTEXITCODE }; & $javaLiteral $javaOptionsLiteral -jar $jarLiteral"
    $powerShellExe = Resolve-PowerShellExe
    $script:backend = Start-Process -FilePath $powerShellExe `
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

# 一次性、幂等初始化两个 node sidecar（后端按需 spawn，这里只保证依赖/构建就位，已装好就跳过）。
function Initialize-NodeDeps {
    if (-not $NpmCmd) { Write-Host '[supervisor] 跳过 sidecar 初始化（npm 未找到）'; return }
    # 1) claude-agent（claude-chat 懒启动 node dist/server.js）：需先构建出 dist/server.js
    $sidecar = Join-Path $RepoRoot 'sidecar\claude-agent'
    if (-not (Test-Path (Join-Path $sidecar 'dist\server.js'))) {
        Write-Host '[supervisor] init claude-agent sidecar (npm install + build)...'
        Push-Location $sidecar
        try {
            if (-not (Test-Path 'node_modules')) { & npm install --no-audit --no-fund }
            & npm run build
            if ($LASTEXITCODE -ne 0) { Write-Host '[supervisor] WARN: claude-agent build 失败；claude-chat 可能起不来' }
        } catch { Write-Host "[supervisor] WARN: claude-agent init 出错: $($_.Exception.Message)" } finally { Pop-Location }
    } else { Write-Host '[supervisor] claude-agent sidecar 已构建，跳过' }
    # 2) undetected-browser（browser-request 的 undetected-node 引擎）：需 node_modules(patchright) + chromium
    $undetected = Join-Path $RepoRoot 'node-services\undetected-browser'
    if (-not (Test-Path (Join-Path $undetected 'node_modules'))) {
        Write-Host '[supervisor] init undetected-browser (npm install + install-browser, 首次下 ~150MB chromium)...'
        Push-Location $undetected
        try {
            & npm install --no-audit --no-fund
            if ($LASTEXITCODE -eq 0) {
                & npm run install-browser
                if ($LASTEXITCODE -ne 0) { Write-Host '[supervisor] WARN: chromium 安装失败；undetected-node 引擎不可用' }
            } else { Write-Host '[supervisor] WARN: undetected-browser npm install 失败' }
        } catch { Write-Host "[supervisor] WARN: undetected-browser init 出错: $($_.Exception.Message)" } finally { Pop-Location }
    } else { Write-Host '[supervisor] undetected-browser 依赖已就绪，跳过' }
}

# 微信监控 sidecar（python-services\wechat，wxauto）。完全隔离、尽力而为：
#   - Start-Process 异步起独立进程/窗口：首次建 venv/pip install 可能数分钟，绝不阻塞 supervisor；
#   - 整段 try/catch：起不来只打 WARN，绝不影响 backend / frontend / 其它 sidecar；
#   - 不纳入下面的守护重启循环：它挂了就挂了，后端 WechatMonitorService 有退避兜底；
#   - 前置条件是「微信已登录」，这里无法判断，交给 sidecar 自己（/health 会报 wechat_online=false）。
function Start-WechatSidecar {
    try {
        $wechatDir = Join-Path $RepoRoot 'python-services\wechat'
        $bat = Join-Path $wechatDir 'start.bat'
        if (-not (Test-Path -LiteralPath $bat)) { Write-Host '[supervisor] wechat sidecar start.bat 不存在，跳过'; return }
        # 已在 :9700 监听则不重复拉起（避免重启 supervisor 时起第二个）。
        $listening = $false
        try { $listening = [bool](Get-NetTCPConnection -LocalPort 9700 -State Listen -ErrorAction Stop) } catch { }
        if ($listening) { Write-Host '[supervisor] wechat sidecar 已在 :9700，跳过'; return }
        Write-Host '[supervisor] start wechat sidecar (python-services\wechat\start.bat，独立窗口，首次装依赖较慢)...'
        Start-Process -FilePath $bat -WorkingDirectory $wechatDir -ErrorAction Stop | Out-Null
    } catch {
        Write-Host "[supervisor] WARN: wechat sidecar 启动失败（不影响其它作业）: $($_.Exception.Message)"
    }
}

# 访客分析 AgentScope sidecar（python-services\visitor-analysis）。隔离、尽力而为，同 wechat：
#   - 独立窗口异步起，首次建 .venv/pip install 较慢，绝不阻塞 supervisor；
#   - 整段 try/catch：起不来只 WARN，不连累 backend / frontend / 其它 sidecar；不进守护循环；
#   - 需 VA_LLM_API_KEY（未设则灰区分类返回 UNKNOWN，后端标「待人工确认」）；端口 9600。
function Start-VisitorAnalysisSidecar {
    try {
        $vaDir = Join-Path $RepoRoot 'python-services\visitor-analysis'
        $bat = Join-Path $vaDir 'start.bat'
        if (-not (Test-Path -LiteralPath $bat)) { Write-Host '[supervisor] visitor-analysis sidecar start.bat 不存在，跳过'; return }
        $listening = $false
        try { $listening = [bool](Get-NetTCPConnection -LocalPort 9600 -State Listen -ErrorAction Stop) } catch { }
        if ($listening) { Write-Host '[supervisor] visitor-analysis sidecar 已在 :9600，跳过'; return }
        Write-Host '[supervisor] start visitor-analysis sidecar (python-services\visitor-analysis\start.bat，独立窗口，首次装依赖较慢)...'
        Start-Process -FilePath $bat -WorkingDirectory $vaDir -ErrorAction Stop | Out-Null
    } catch {
        Write-Host "[supervisor] WARN: visitor-analysis sidecar 启动失败（不影响其它作业）: $($_.Exception.Message)"
    }
}

# 显式重启（/restart）时回收两个 Python sidecar，让其吃到新代码/新配置。
# 必须先停端口持有者：Start-* 自带「端口已监听即跳过」的幂等保护，不先停就只会被 skip、旧进程长存。
# 停后留一小段时间让监听端口释放，避免 Start-* 误判「已在监听」而跳过。
function Restart-PythonSidecars {
    Write-Host '[supervisor] 回收 Python sidecar：visitor-analysis(:9600) + wechat(:9700)'
    Stop-PortHolders 9600
    Stop-PortHolders 9700
    Start-Sleep -Milliseconds 800
    Start-VisitorAnalysisSidecar
    Start-WechatSidecar
}

function Start-AgentScopeStudio {
    try {
        $listening = $false
        try { $listening = [bool](Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction Stop) } catch { }
        if ($listening) { Write-Host '[supervisor] AgentScope Studio 已在 :3000，跳过'; return }
        if (-not $NpmCmd) { Write-Host '[supervisor] npm 未找到，跳过 AgentScope Studio (:3000)'; return }

        $installThenRun = -not [bool](Get-Command as_studio -ErrorAction SilentlyContinue)
        $runCommand = if ($installThenRun) {
            "npm install -g @agentscope/studio; if (`$LASTEXITCODE -ne 0) { exit `$LASTEXITCODE }; as_studio"
        } else {
            "as_studio"
        }
        Write-Host '[supervisor] start AgentScope Studio (:3000，独立进程，首次安装较慢)...'
        Start-Process -FilePath (Resolve-PowerShellExe) `
            -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', $runCommand) `
            -ErrorAction Stop | Out-Null
    } catch {
        Write-Host "[supervisor] WARN: AgentScope Studio 启动失败（不影响其它作业）: $($_.Exception.Message)"
    }
}

function Start-Frontend {
    if (-not $NpmCmd) { Write-Host '[supervisor] 跳过前端启动（npm 未找到）'; return }
    Stop-PortHolders $FrontendPort
    Write-Host "[supervisor] $(Get-Date -Format 'HH:mm:ss') start frontend (vite dev :$FrontendPort)..."
    $frontendDir = Join-Path $RepoRoot 'frontend'
    $utf8Command = "chcp.com 65001 > `$null; `$utf8Encoding = [System.Text.UTF8Encoding]::new(`$false); [Console]::InputEncoding = `$utf8Encoding; [Console]::OutputEncoding = `$utf8Encoding; `$global:OutputEncoding = `$utf8Encoding"
    $dirLiteral = Quote-PowerShellLiteral $frontendDir
    $runCommand = "$utf8Command; Set-Location -LiteralPath $dirLiteral; npm run dev"
    $script:frontend = Start-Process -FilePath (Resolve-PowerShellExe) `
        -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', $runCommand) `
        -PassThru -NoNewWindow
}

function Stop-Frontend {
    if ($script:frontend -and -not $script:frontend.HasExited) {
        # npm spawns node/esbuild children, so stop the whole process tree.
        & taskkill /PID $script:frontend.Id /T /F 2>&1 | Out-Null
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
        Write-Json $res 200 @{ ok = $true; message = 'restart triggered, backend + python sidecars will return soon' }
        Write-Host "[supervisor] $(Get-Date -Format 'HH:mm:ss') /restart received, taking over port and restarting"
        Stop-Backend
        Stop-PortHolders $BackendPort
        # 一并回收 Python sidecar，否则改了 sidecar 代码/配置后重启不生效（旧进程占着端口被 skip）。
        Restart-PythonSidecars
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
Write-Host "[supervisor] repo=$RepoRoot  mvn=$MvnCmd  java=$JavaCmd"

# 起服务前先把两个 node sidecar 的依赖/构建补齐（幂等，已就绪则秒过）。
Initialize-NodeDeps

# 一键：后端 + 前端一起拉起，各自守护；退出（Ctrl+C）时一并收尾。
Start-Backend
Start-Frontend
# 微信监控 sidecar：尽力起一次，失败/缺依赖只 WARN，不进守护循环，不连累上面两个。
Start-WechatSidecar
# 访客分析 AgentScope sidecar：同样尽力起一次（端口 9600），失败只 WARN。
Start-VisitorAnalysisSidecar
# AgentScope Studio：移动端监控入口（端口 3000），失败不影响 toolbox 主流程。
Start-AgentScopeStudio

try {
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
            if (-not $script:frontend -or $script:frontend.HasExited) {
                Write-Host "[supervisor] $(Get-Date -Format 'HH:mm:ss') frontend exited, restart after 2s"
                Start-Sleep -Seconds 2
                Start-Frontend
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
            if (-not $script:frontend -or $script:frontend.HasExited) {
                Write-Host "[supervisor] $(Get-Date -Format 'HH:mm:ss') frontend exited, restart after 2s"
                Start-Sleep -Seconds 2
                Start-Frontend
            }
            Start-Sleep -Seconds 1
        }
    }
} finally {
    Write-Host '[supervisor] shutting down: stopping frontend + backend...'
    Stop-Frontend
    Stop-Backend
}
