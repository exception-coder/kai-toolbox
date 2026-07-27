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
#   pwsh -File scripts\run-supervised.ps1                # dev (default, incremental)
#   pwsh -File scripts\run-supervised.ps1 -Mode full     # package + fat jar
#   pwsh -File scripts\run-supervised.ps1 -HotReload     # dev + 存盘即编译并热重启
# Ctrl+C stops the supervisor loop.

param(
    [ValidateSet('dev', 'full')]
    [string]$Mode = 'dev',
    # 存盘即自动重启（源码监听 + DevTools 重启）。默认关：重启时机由人控制，
    # 走 POST /restart。热重启会换掉 Spring 上下文却留下旧上下文的后台线程/长连接
    # （claude-chat sidecar 就踩过：僵尸 bean 继续抢 sidecar，事件投递到没人看的一端），
    # 编译中途的半成品 class 也会触发无意义的重启。要用就显式开。
    [switch]$HotReload
)

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

function Test-Java21([string]$command) {
    try {
        $versionOutput = (& $command -version 2>&1 | Out-String)
        return $LASTEXITCODE -eq 0 -and $versionOutput -match 'version\s+"21(?:[.\-+]|\")'
    } catch {
        return $false
    }
}

function Resolve-RequiredTool(
    [string]$envName,
    [string]$displayName,
    [string]$commandName,
    [string[]]$fallbacks,
    [scriptblock]$validator = $null,
    [string]$validationHint = ''
) {
    $configuredPath = [Environment]::GetEnvironmentVariable($envName, 'Process')
    $resolvedPath = Resolve-Tool $configuredPath $commandName $fallbacks

    while (-not $resolvedPath -or ($validator -and -not (& $validator $resolvedPath))) {
        if ($resolvedPath) {
            Write-Host "[supervisor] $displayName 校验失败：$resolvedPath$validationHint"
        } else {
            Write-Host "[supervisor] 未找到 $displayName，启动已暂停。"
        }

        $inputPath = (Read-Host "[supervisor] 请输入 $displayName 可执行文件或安装目录路径").Trim().Trim('"').Trim("'")
        $resolvedPath = Resolve-ExePath $inputPath $commandName
        if (-not $resolvedPath) {
            Write-Host "[supervisor] 路径无效或其中未找到 $commandName，请重新输入。"
        }
    }

    [Environment]::SetEnvironmentVariable($envName, $resolvedPath, 'Process')
    Write-Host "[supervisor] $displayName=$resolvedPath"
    return $resolvedPath
}

$MvnCmd = Resolve-RequiredTool 'MVN_CMD' 'Maven' 'mvn' @(
    'D:\devApps\apache-maven-3.9.16-bin\apache-maven-3.9.16\bin\mvn.cmd',
    'C:\Program Files\apache-maven\bin\mvn.cmd'
)

# Java：构建(mvn)和运行(java -jar)都必须用 JDK 21，否则 jar 是 17+ 字节码、PATH 上的旧 JDK 跑不了。
$JavaCmd = Resolve-RequiredTool 'JAVA_CMD' 'Java（JDK 21）' 'java' @(
    $(if ($env:JAVA_HOME) { Join-Path $env:JAVA_HOME 'bin\java.exe' } else { $null })
) ${function:Test-Java21} '（必须为 JDK 21）'
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

# whisper 后端模式，来自 run-tools.conf 的 TOOLBOX_WHISPER_MODE，缺省 cli（同 application.yml）。
#   cli         —— whisper-cli.exe 子进程，需要 binary + model 就位，不占常驻显存
#   asr-service —— faster-whisper Python 服务(:9500)，绕开 CJK 路径/参数兼容坑，模型常驻显存更快
# 字幕与语言识别两种模式都支持；不可用时前端按 capability 端点禁用按钮并显示原因。
# 曾经这里硬编码 asr-service，覆盖了 yml 的 cli 又从不拉起 :9500 服务，结果字幕/语言识别双双废掉。
# 教训：运行模式与它依赖的 sidecar 必须由同一处决定 —— 见下面 Start-FasterWhisperSidecar。
$WhisperMode = if ($env:TOOLBOX_WHISPER_MODE) { $env:TOOLBOX_WHISPER_MODE.Trim().ToLower() } else { 'cli' }
if ($WhisperMode -notin @('cli', 'asr-service')) {
    Write-Host "[supervisor] WARN: TOOLBOX_WHISPER_MODE='$WhisperMode' 非法（只支持 cli / asr-service），回退 cli"
    $WhisperMode = 'cli'
}

# faster-whisper ASR 服务端口，须与 application.yml 的 toolbox.whisper.service-url 一致。
$AsrPort = 9500

# npm：前端 dev 与两个 node sidecar 初始化都要它。优先 conf 注入的 NPM_CMD，其次 PATH；
# 把其所在目录前置进 PATH，确保 spawn 出去的子 powershell 也能直接调 npm。
$NpmCmd = Resolve-RequiredTool 'NPM_CMD' 'npm' 'npm' @(
    'D:\Program Files\nodejs\npm.cmd',
    'C:\Program Files\nodejs\npm.cmd'
)
$npmDir = Split-Path -Parent $NpmCmd
if ($npmDir -and (";$env:PATH;" -notlike "*;$npmDir;*")) { $env:PATH = "$npmDir;$env:PATH" }

# /restart 控制端点的令牌，取自 run-tools.conf 的 TOOLBOX_SUPERVISOR_RESTART_TOKEN。
# 公开仓库禁止硬编码；未配置时令牌为空，/restart 一律拒绝。
$RestartToken = $env:TOOLBOX_SUPERVISOR_RESTART_TOKEN

$HttpPrefix = 'http://127.0.0.1:18081/'

# Backend port. Must match server.port in application.yml.
$BackendPort = 18080

# claude-agent node sidecar 端口，须与 application.yml 的 toolbox.claude-chat.sidecar-port 一致。
# 后端懒启动 node dist/server.js 绑此端口；重启时必须一并清掉，否则旧 sidecar 变孤儿占端口、
# 新 sidecar 命中 EADDRINUSE 退出，后端连回旧代码，导致 sidecar 侧改动重启后不生效。
$SidecarPort = 18890

$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

# Marks backend children as supervisor-owned so SupervisorBootstrap avoids loops.
$env:KAI_SUPERVISED = '1'

$script:backend = $null
$script:frontend = $null
$script:lastStart = $null
$script:hotReloadWatchers = @()
$script:hotReloadRegistrations = @()
$script:hotCompile = $null
$script:hotReloadDue = $null
$script:hotReloadFullRestart = $false

$HotReloadEventPrefix = 'kai-toolbox-hot-reload'
$HotReloadDebounceMs = 800

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
    # 一并清掉上一代 node claude-agent sidecar：它是后端懒启动的子进程，java 先退时会被重挂养成孤儿、
    # 逃过 tree-kill 继续占 18890；不清掉的话新后端懒启动的新 sidecar 会 EADDRINUSE 退出、连回旧代码。
    Stop-PortHolders $SidecarPort
    # 旧 sidecar 已杀、新的还没起，趁这个空档把 dist 校验到最新：下面 mvn 会重编译 Java，
    # 但 sidecar 是独立的 TS 产物，不在这儿构建就只有 Java 侧生效。源码没动时只比一次时间戳，开销可忽略。
    Ensure-ClaudeAgentBuild
    Write-Host "[supervisor] $(Get-Date -Format 'HH:mm:ss') start backend (mode=$Mode)..."
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
        "-Dtoolbox.whisper.mode=$WhisperMode"
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
    # DevTools 热重启在 application.yml 里默认关（改完由人发 POST /restart）；-HotReload 时才用
    # 系统属性顶回来——系统属性优先级高于 application.yml，一个开关同时管住监听与重启两端。
    if ($HotReload) { $javaOptions += '-Dspring.devtools.restart.enabled=true' }
    $mvnLiteral = Quote-PowerShellLiteral $MvnCmd
    $javaLiteral = Quote-PowerShellLiteral $JavaCmd
    $javaOptionsLiteral = ($javaOptions | ForEach-Object { Quote-PowerShellLiteral $_ }) -join ' '
    $jarLiteral = Quote-PowerShellLiteral $starterJar
    $utf8Command = "chcp.com 65001 > `$null; `$utf8Encoding = [System.Text.UTF8Encoding]::new(`$false); [Console]::InputEncoding = `$utf8Encoding; [Console]::OutputEncoding = `$utf8Encoding; `$global:OutputEncoding = `$utf8Encoding"
    if ($Mode -eq 'full') {
        $runCommand = "$utf8Command; & $mvnLiteral -pl toolbox-starter -am '-Dskip.frontend=true' package; if (`$LASTEXITCODE -ne 0) { exit `$LASTEXITCODE }; & $javaLiteral $javaOptionsLiteral -jar $jarLiteral"
    } else {
        $jvmArgumentsProperty = Quote-PowerShellLiteral ("-Dspring-boot.run.jvmArguments=" + ($javaOptions -join ' '))
        $runCommand = "$utf8Command; & $mvnLiteral -pl toolbox-starter -am '-Dskip.frontend=true' spring-boot:run $jvmArgumentsProperty"
    }
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

function Start-HotReloadWatcher {
    if ($Mode -ne 'dev') { return }
    if (-not $HotReload) {
        Write-Host '[supervisor] hot reload 关闭（默认）：改完代码自己发 POST /restart，或加 -HotReload 开启'
        return
    }

    $sourceRoots = Get-ChildItem -LiteralPath $RepoRoot -Filter 'pom.xml' -File -Recurse `
            -ErrorAction SilentlyContinue |
        ForEach-Object { Join-Path $_.DirectoryName 'src\main' } |
        Where-Object { Test-Path -LiteralPath $_ -PathType Container } |
        Select-Object -Unique
    $watchSpecs = @($sourceRoots | ForEach-Object {
        [pscustomobject]@{ Path = $_; Filter = '*.*'; Recursive = $true }
    })
    $watchSpecs += [pscustomobject]@{ Path = $RepoRoot; Filter = 'pom.xml'; Recursive = $true }

    $watcherIndex = 0
    foreach ($spec in $watchSpecs) {
        $watcher = [System.IO.FileSystemWatcher]::new($spec.Path, $spec.Filter)
        $watcher.IncludeSubdirectories = $spec.Recursive
        $watcher.NotifyFilter = [System.IO.NotifyFilters]::FileName `
            -bor [System.IO.NotifyFilters]::DirectoryName `
            -bor [System.IO.NotifyFilters]::LastWrite
        $watcher.EnableRaisingEvents = $true
        $script:hotReloadWatchers += $watcher
        foreach ($eventName in @('Changed', 'Created', 'Deleted', 'Renamed')) {
            $sourceIdentifier = "$HotReloadEventPrefix-$watcherIndex-$eventName"
            $script:hotReloadRegistrations += Register-ObjectEvent `
                -InputObject $watcher `
                -EventName $eventName `
                -SourceIdentifier $sourceIdentifier
        }
        $watcherIndex++
    }
    Write-Host "[supervisor] hot reload enabled: $($sourceRoots.Count) source roots -> compile -> DevTools restart"
}

function Stop-HotReloadWatcher {
    foreach ($registration in $script:hotReloadRegistrations) {
        Unregister-Event -SubscriptionId $registration.Id -ErrorAction SilentlyContinue
    }
    Get-Event | Where-Object SourceIdentifier -Like "$HotReloadEventPrefix-*" |
        Remove-Event -ErrorAction SilentlyContinue
    $script:hotReloadRegistrations = @()
    foreach ($watcher in $script:hotReloadWatchers) {
        $watcher.Dispose()
    }
    $script:hotReloadWatchers = @()
    if ($script:hotCompile -and -not $script:hotCompile.HasExited) {
        & taskkill /PID $script:hotCompile.Id /T /F 2>&1 | Out-Null
    }
}

function Test-HotReloadPath([string]$path) {
    if (-not $path) { return $false }
    $normalized = $path.Replace('/', '\')
    if ([System.IO.Path]::GetFileName($normalized) -eq 'pom.xml') { return $true }
    return $normalized -match '\\src\\main\\(?:java|resources)\\'
}

function Receive-HotReloadEvents {
    $matched = $false
    foreach ($event in @(Get-Event | Where-Object SourceIdentifier -Like "$HotReloadEventPrefix-*")) {
        $path = $event.SourceEventArgs.FullPath
        if (Test-HotReloadPath $path) {
            $matched = $true
            if ([System.IO.Path]::GetFileName($path) -eq 'pom.xml') {
                $script:hotReloadFullRestart = $true
            }
        }
        Remove-Event -EventIdentifier $event.EventIdentifier -ErrorAction SilentlyContinue
    }
    if ($matched) {
        $script:hotReloadDue = (Get-Date).AddMilliseconds($HotReloadDebounceMs)
    }
}

function Start-HotCompile {
    $mvnLiteral = Quote-PowerShellLiteral $MvnCmd
    $repoLiteral = Quote-PowerShellLiteral $RepoRoot
    $command = "Set-Location -LiteralPath $repoLiteral; & $mvnLiteral -pl toolbox-starter -am '-Dskip.frontend=true' compile"
    Write-Host "[supervisor] $(Get-Date -Format 'HH:mm:ss') source changed, incremental compile..."
    $script:hotCompile = Start-Process -FilePath (Resolve-PowerShellExe) `
        -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', $command) `
        -PassThru -NoNewWindow
    $script:hotReloadDue = $null
}

function Update-HotReload {
    if ($Mode -ne 'dev' -or -not $HotReload) { return }
    Receive-HotReloadEvents

    if ($script:hotCompile) {
        if (-not $script:hotCompile.HasExited) { return }
        if ($script:hotCompile.ExitCode -eq 0) {
            Write-Host "[supervisor] $(Get-Date -Format 'HH:mm:ss') compile succeeded; waiting for DevTools restart"
        } else {
            Write-Host "[supervisor] $(Get-Date -Format 'HH:mm:ss') compile failed; old backend remains active"
        }
        $script:hotCompile = $null
    }

    if (-not $script:hotReloadDue -or (Get-Date) -lt $script:hotReloadDue) { return }
    if ($script:hotReloadFullRestart) {
        Write-Host "[supervisor] $(Get-Date -Format 'HH:mm:ss') pom.xml changed, restart backend process"
        $script:hotReloadFullRestart = $false
        $script:hotReloadDue = $null
        Stop-Backend
        return
    }
    Start-HotCompile
}

# 取一组路径下最新的文件修改时间（目录递归）。用于判断源码是否比构建产物新。缺失路径跳过。
function Get-LatestWriteTime([string[]]$paths) {
    $latest = [datetime]::MinValue
    foreach ($p in $paths) {
        if (-not (Test-Path -LiteralPath $p)) { continue }
        if (Test-Path -LiteralPath $p -PathType Container) {
            foreach ($it in (Get-ChildItem -LiteralPath $p -Recurse -File -ErrorAction SilentlyContinue)) {
                if ($it.LastWriteTimeUtc -gt $latest) { $latest = $it.LastWriteTimeUtc }
            }
        } else {
            $it = Get-Item -LiteralPath $p -ErrorAction SilentlyContinue
            if ($it -and $it.LastWriteTimeUtc -gt $latest) { $latest = $it.LastWriteTimeUtc }
        }
    }
    return $latest
}

# claude-agent sidecar（claude-chat 懒启动 node dist/server.js）的依赖/构建就位，幂等，已最新则跳过。
#
# 单独成函数是为了让 Start-Backend 也能调。后端每次重启都会 Stop-PortHolders 掉旧 sidecar、再由新
# 后端懒启动一个，而它加载的是 dist/server.js。若只在 supervisor 首启时构建一次，「改 sidecar 源码
# → 点 UI 重启」这条最常用的路径就永远加载旧 dist：mvn 把 Java 重编译了，sidecar 还是旧的，两边
# 版本对不上。更糟的是它不报错——server.ts 对不认识的消息类型只走 default 打一行 warn 就丢掉，
# 表现为功能静默失效，很难往「sidecar 没重新编译」上想。
function Ensure-ClaudeAgentBuild {
    if (-not $NpmCmd) { Write-Host '[supervisor] 跳过 claude-agent 构建（npm 未找到）'; return }
    # 不只判断「dist 是否存在」，还要判断「src 是否比 dist 新」——否则改了 sidecar 源码后
    # 因旧 dist 还在被「已构建，跳过」，后端仍加载旧代码，每次都得手动 npm run build（开发期老坑）。
    $sidecar = Join-Path $RepoRoot 'sidecar\claude-agent'
    $distServer = Join-Path $sidecar 'dist\server.js'
    $nodeModules = Join-Path $sidecar 'node_modules'
    $pkgJson = Join-Path $sidecar 'package.json'
    # 依赖：node_modules 缺失、或 package.json 比 node_modules 新（改了依赖）就重装。
    $nmTime = if (Test-Path -LiteralPath $nodeModules) { (Get-Item -LiteralPath $nodeModules).LastWriteTimeUtc } else { [datetime]::MinValue }
    $pkgTime = if (Test-Path -LiteralPath $pkgJson) { (Get-Item -LiteralPath $pkgJson).LastWriteTimeUtc } else { [datetime]::MinValue }
    $needInstall = (-not (Test-Path -LiteralPath $nodeModules)) -or ($pkgTime -gt $nmTime)
    # 构建：dist/server.js 缺失、或 src/tsconfig/package.json 比 dist 新就重建。
    $srcNewest = Get-LatestWriteTime @((Join-Path $sidecar 'src'), $pkgJson, (Join-Path $sidecar 'tsconfig.json'))
    $distTime = if (Test-Path -LiteralPath $distServer) { (Get-Item -LiteralPath $distServer).LastWriteTimeUtc } else { [datetime]::MinValue }
    $needBuild = (-not (Test-Path -LiteralPath $distServer)) -or ($srcNewest -gt $distTime)
    if ($needInstall -or $needBuild) {
        $reason = if (-not (Test-Path -LiteralPath $distServer)) { 'dist/server.js 缺失' } elseif ($needBuild) { '源码比 dist 新' } else { '依赖变更' }
        Write-Host "[supervisor] init claude-agent sidecar ($reason)..."
        Push-Location $sidecar
        try {
            if ($needInstall) { & npm install --no-audit --no-fund }
            if ($needBuild -or $needInstall) {
                & npm run build
                if ($LASTEXITCODE -ne 0) { Write-Host '[supervisor] WARN: claude-agent build 失败；claude-chat 可能起不来' }
            }
        } catch { Write-Host "[supervisor] WARN: claude-agent init 出错: $($_.Exception.Message)" } finally { Pop-Location }
    } else { Write-Host '[supervisor] claude-agent sidecar dist 最新，跳过' }
}

# 一次性、幂等初始化 node sidecar 依赖（后端按需 spawn，这里只保证依赖/构建就位，已就绪则跳过）。
# claude-agent 的构建同时也挂在 Start-Backend 上（每次重启都校验一遍），这里只是首启先跑一次。
function Initialize-NodeDeps {
    if (-not $NpmCmd) { Write-Host '[supervisor] 跳过 sidecar 初始化（npm 未找到）'; return }
    Ensure-ClaudeAgentBuild
    # undetected-browser（browser-request 的 undetected-node 引擎）：需 node_modules(patchright) + chromium。
    # 只在首启做：与后端重启无关，且首次要下 ~150MB chromium，不该拖慢每一次重启。
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

# faster-whisper ASR sidecar（python-services\faster-whisper，:9500）。隔离、尽力而为，同 wechat。
# 只在 $WhisperMode -eq 'asr-service' 时拉起 —— 模式决定要不要这个进程，两者同一处判断，
# 不会再出现「模式钉在 asr-service 却没人起 :9500」的空挡。cli 模式下起它纯属白占显存。
function Start-FasterWhisperSidecar {
    try {
        if ($WhisperMode -ne 'asr-service') {
            Write-Host "[supervisor] whisper mode=$WhisperMode，不需要 ASR sidecar(:$AsrPort)，跳过"
            return
        }
        $asrDir = Join-Path $RepoRoot 'python-services\faster-whisper'
        $bat = Join-Path $asrDir 'start.bat'
        if (-not (Test-Path -LiteralPath $bat)) {
            Write-Host '[supervisor] WARN: faster-whisper start.bat 不存在，asr-service 模式下字幕将不可用'
            return
        }
        $listening = $false
        try { $listening = [bool](Get-NetTCPConnection -LocalPort $AsrPort -State Listen -ErrorAction Stop) } catch { }
        if ($listening) { Write-Host "[supervisor] faster-whisper sidecar 已在 :$AsrPort，跳过"; return }
        Write-Host "[supervisor] start faster-whisper sidecar (:$AsrPort，独立窗口，首次装依赖 + 下模型较慢)..."
        Start-Process -FilePath $bat -WorkingDirectory $asrDir -ErrorAction Stop | Out-Null
    } catch {
        Write-Host "[supervisor] WARN: faster-whisper sidecar 启动失败（不影响其它作业）: $($_.Exception.Message)"
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
    $asrNote = if ($WhisperMode -eq 'asr-service') { " + faster-whisper(:$AsrPort)" } else { '' }
    Write-Host "[supervisor] 回收 Python sidecar：visitor-analysis(:9600) + wechat(:9700)$asrNote"
    Stop-PortHolders 9600
    Stop-PortHolders 9700
    if ($WhisperMode -eq 'asr-service') { Stop-PortHolders $AsrPort }
    Start-Sleep -Milliseconds 800
    Start-VisitorAnalysisSidecar
    Start-WechatSidecar
    Start-FasterWhisperSidecar
}

# 返回 :$port 上监听进程的 pid / 名字 / 命令行（无人监听则 Occupied=$false）。
# 「端口被占」不等于「我要的那个服务在跑」——要跳过启动，得先凭命令行认出占用者是谁。
function Get-PortHolder([int]$port) {
    $holderPid = $null
    try {
        $holderPid = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction Stop |
            Select-Object -ExpandProperty OwningProcess -Unique | Select-Object -First 1
    } catch {
        foreach ($l in (netstat -ano | Select-String ":$port\s.*LISTENING")) {
            $tok = ($l.ToString().Trim() -split '\s+')[-1]
            if ($tok -match '^\d+$') { $holderPid = [int]$tok; break }
        }
    }
    if (-not $holderPid) {
        return [pscustomobject]@{ Occupied = $false; ProcessId = $null; Name = $null; CommandLine = $null }
    }
    $name = $null
    $commandLine = $null
    try {
        $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$holderPid" -ErrorAction Stop
        $name = $proc.Name
        $commandLine = $proc.CommandLine
    } catch {
        # 拿不到进程详情（权限/进程刚退）：只回 pid，调用方按「认不出」处理
    }
    return [pscustomobject]@{ Occupied = $true; ProcessId = $holderPid; Name = $name; CommandLine = $commandLine }
}

function Start-AgentScopeStudio {
    try {
        # 3000 是烂大街的端口（别的 dev server / 面板都可能占）。只按「端口有人监听」就跳过，
        # 会在被别人占用时静默不启动，日志还写着一句让人放心的「已在 :3000」——认人再决定。
        $holder = Get-PortHolder 3000
        if ($holder.Occupied) {
            if ("$($holder.CommandLine)" -match 'as_studio|agentscope') {
                Write-Host '[supervisor] AgentScope Studio 已在 :3000，跳过'
            } else {
                Write-Host "[supervisor] WARN: :3000 被非 Studio 进程占用（PID=$($holder.ProcessId) $($holder.Name)），本次不启动 Studio；要腾端口可跑 stop-supervised.ps1 -Ports 3000"
            }
            return
        }
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
    $frontendDir = Join-Path $RepoRoot 'frontend'
    $nodeModules = Join-Path $frontendDir 'node_modules'
    $installedLock = Join-Path $nodeModules '.package-lock.json'
    $packageFiles = @(
        (Join-Path $frontendDir 'package.json'),
        (Join-Path $frontendDir 'package-lock.json')
    )
    $installedTime = if (Test-Path -LiteralPath $installedLock) {
        (Get-Item -LiteralPath $installedLock).LastWriteTimeUtc
    } else {
        [datetime]::MinValue
    }
    $dependencyTime = Get-LatestWriteTime $packageFiles
    $needInstall = (-not (Test-Path -LiteralPath $nodeModules)) -or
        (-not (Test-Path -LiteralPath $installedLock)) -or
        ($dependencyTime -gt $installedTime)

    if ($needInstall) {
        Write-Host '[supervisor] frontend 依赖缺失或已变更，执行 npm install...'
        Push-Location $frontendDir
        try {
            & $NpmCmd install --no-audit --no-fund
            if ($LASTEXITCODE -ne 0) {
                Write-Host '[supervisor] ERROR: frontend npm install 失败，跳过前端启动'
                return
            }
        } catch {
            Write-Host "[supervisor] ERROR: frontend npm install 出错，跳过前端启动: $($_.Exception.Message)"
            return
        } finally {
            Pop-Location
        }
    }

    Stop-PortHolders $FrontendPort
    Write-Host "[supervisor] $(Get-Date -Format 'HH:mm:ss') start frontend (vite dev :$FrontendPort)..."
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
        # node claude-agent sidecar(:18890) 由守护循环随后调用的 Start-Backend 统一清理+懒启动，这里不重复处理。
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
Write-Host "[supervisor] repo=$RepoRoot  mode=$Mode  mvn=$MvnCmd  java=$JavaCmd"
Write-Host "[supervisor] whisper mode=$WhisperMode（改用 run-tools.conf 的 TOOLBOX_WHISPER_MODE）"

# 起服务前先把两个 node sidecar 的依赖/构建补齐（幂等，已就绪则秒过）。
Initialize-NodeDeps

# 一键：后端 + 前端一起拉起，各自守护；退出（Ctrl+C）时一并收尾。
Start-Backend
Start-Frontend
Start-HotReloadWatcher
# 微信监控 sidecar：尽力起一次，失败/缺依赖只 WARN，不进守护循环，不连累上面两个。
Start-WechatSidecar
# 访客分析 AgentScope sidecar：同样尽力起一次（端口 9600），失败只 WARN。
Start-VisitorAnalysisSidecar
# faster-whisper ASR sidecar：仅 asr-service 模式需要（端口 9500），cli 模式自动跳过。
Start-FasterWhisperSidecar
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
            Update-HotReload
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
            Update-HotReload
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
    Stop-HotReloadWatcher
    Stop-Frontend
    Stop-Backend
}
