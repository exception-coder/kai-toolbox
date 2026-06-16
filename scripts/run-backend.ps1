# 可靠启动 kai-toolbox 后端（供 project-runner / 手动调用）。
# 固化以下步骤，避免每次临时拼命令：
#   1. 确保 Node sidecar 已构建（claude-chat 工具依赖 sidecar/claude-agent/dist）
#   2. 释放 18080 端口（杀掉残留监听进程）
#   3. mvn install 把各模块 jar 落到本地仓库（spring-boot:run 不带 -am 时依赖需已安装）
#   4. 只对 toolbox-starter 跑 spring-boot:run
#      —— 不能用 `-pl toolbox-starter -am spring-boot:run`：-am 会把 run 目标也作用到
#         根聚合模块 kai-toolbox（pom 打包、无 main class）从而 BUILD FAILURE。
$ErrorActionPreference = 'Stop'

# 仓库根 = 本脚本(scripts/)的上级目录，cwd 无关
$repo = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repo

# --- 解析 mvn：同目录 run-tools.conf(MVN_CMD) → 环境变量/PATH/回退 → 交互式，命中即写回 conf ---
# 与 run-supervised.ps1 共用同一份 run-tools.conf，配一次两个脚本都受益。
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
        if ($i -ge 1 -and $t.Substring(0, $i).Trim() -eq $key) { $out.Add("$key=$value"); $found = $true; continue }
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
  Write-Host "[run-backend] 已写回 run-tools.conf：$key=$value"
}

# 把路径规整成真正的可执行文件：已是文件→原样；是目录→在 <dir> 和 <dir>\bin 下找
# mvn.cmd/.bat/mvn（用户填 Maven 主目录也能自动定位到 bin\mvn.cmd）。找不到返回 $null。
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

function Resolve-Mvn {
  $v = Read-ConfValue 'MVN_CMD'
  if ($v) {
    $r = Resolve-ExePath $v 'mvn'
    if ($r) { if ($r -ne $v) { Write-ConfValue 'MVN_CMD' $r }; return $r }
    Write-Host "[run-backend] 配置中的 MVN_CMD 不是可用的可执行文件，重新探测：$v"
  }
  $r = Resolve-ExePath $env:MVN_CMD 'mvn'
  if ($r) { Write-ConfValue 'MVN_CMD' $r; return $r }
  $c = Get-Command mvn -ErrorAction SilentlyContinue
  if ($c) { Write-ConfValue 'MVN_CMD' $c.Source; return $c.Source }
  foreach ($p in @(
      'D:\devapps\apache-maven-3.9.9\bin\mvn.cmd',
      'C:\Program Files\apache-maven\bin\mvn.cmd'
    )) {
    $r = Resolve-ExePath $p 'mvn'
    if ($r) { Write-ConfValue 'MVN_CMD' $r; return $r }
  }
  while ($true) {
    Write-Host ''
    Write-Host '[run-backend] 未找到 Maven (mvn)。'
    Write-Host '[run-backend]   请输入 mvn.cmd 或 Maven 主目录的完整路径；或加入 PATH 后直接回车重新探测；输入 q 退出。'
    Write-Host '[run-backend]   （填入后写回 run-tools.conf 的 MVN_CMD，下次免问）'
    $answer = Read-Host '  mvn 路径'
    if ($answer -eq 'q') { throw 'mvn 未找到，已取消。' }
    if ([string]::IsNullOrWhiteSpace($answer)) {
      $c = Get-Command mvn -ErrorAction SilentlyContinue
      if ($c) { Write-ConfValue 'MVN_CMD' $c.Source; return $c.Source }
      Write-Host '[run-backend] 仍未探测到 mvn。'
      continue
    }
    $r = Resolve-ExePath $answer 'mvn'
    if ($r) { Write-ConfValue 'MVN_CMD' $r; return $r }
    Write-Host "[run-backend] 没找到可执行文件（已试 $answer 及其 bin 下的 mvn.cmd）：$answer"
  }
}
$mvn = Resolve-Mvn

# 让 mvn 用 JDK 21 构建：从 run-tools.conf 的 JAVA_CMD 反推 JAVA_HOME 并覆盖（本机默认可能仍是旧 JDK）。
$javaCfg = Resolve-ExePath (Read-ConfValue 'JAVA_CMD') 'java'
if ($javaCfg -and ($javaCfg -match '[\\/]bin[\\/]java(\.exe)?$')) {
  $env:JAVA_HOME = Split-Path -Parent (Split-Path -Parent $javaCfg)
  Write-Host "[run-backend] JAVA_HOME=$env:JAVA_HOME （供 mvn 构建使用 JDK 21）"
}

# Playwright-Java 首次运行会自动下 ~150MB Chromium；官方 CDN 在境内常被掐，改走国内镜像。已自定义则不覆盖。
if (-not $env:PLAYWRIGHT_DOWNLOAD_HOST) { $env:PLAYWRIGHT_DOWNLOAD_HOST = 'https://cdn.npmmirror.com/binaries/playwright' }

# --- 1. 确保 sidecar 已构建 ---
$sidecar = Join-Path $repo 'sidecar\claude-agent'
if (-not (Test-Path (Join-Path $sidecar 'dist\server.js'))) {
  Write-Host '[run-backend] sidecar 未构建，开始构建...'
  Push-Location $sidecar
  try {
    if (-not (Test-Path 'node_modules')) { npm install --no-audit --no-fund }
    npm run build
  } finally { Pop-Location }
}

# --- 2. 释放 18080，杀掉旧实例后轮询确认空闲 ---
# 注意：用 netstat 而非 Get-NetTCPConnection——后者在本机会漏报监听者（曾把被占端口
# 误报成空闲，导致旧实例没被杀、新实例 bind 失败报 "Port 18080 already in use"）。
for ($i = 0; $i -lt 12; $i++) {
  $pids = netstat -ano |
    Select-String ':18080\s' | Select-String 'LISTENING' |
    ForEach-Object { ($_ -split '\s+')[-1] } | Sort-Object -Unique
  if (-not $pids) { break }
  foreach ($procId in $pids) {
    Write-Host "[run-backend] 18080 被 PID=$procId 占用，停止它"
    Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
  }
  Start-Sleep -Seconds 1
}

# --- 3. 安装模块到本地仓库（跳过前端与测试，增量很快）---
Write-Host '[run-backend] mvn install（-DskipTests -Dskip.frontend=true）...'
& $mvn install -DskipTests '-Dskip.frontend=true' -q
if ($LASTEXITCODE -ne 0) { throw "mvn install 失败 (exit=$LASTEXITCODE)" }

# --- 4. 启动后端（带 AI 秘书向量 RAG 参数）---
# 注意：spring-boot:run 默认 fork 子 JVM，命令行上的 -D 只会落到 Maven 自身 JVM、传不到应用。
# 必须经 -Dspring-boot.run.jvmArguments 把系统属性转交给被 fork 的应用 JVM。
# enabled / host / port 非机密，直接写明；API Key 是机密，仅从环境变量读取，绝不入库。
$ragApiKey = $env:TOOLBOX_AI_SECRETARY_QDRANT_API_KEY
if ([string]::IsNullOrWhiteSpace($ragApiKey)) {
  Write-Host '[run-backend] 警告：未设置 $env:TOOLBOX_AI_SECRETARY_QDRANT_API_KEY，RAG 连 Qdrant 会因缺 API Key 认证失败。'
  Write-Host '[run-backend]   先执行：$env:TOOLBOX_AI_SECRETARY_QDRANT_API_KEY = "你的Qdrant密钥"  再启动本脚本。'
}
$ragJvmArgs = @(
  # 个人秘书 RAG
  '-Dtoolbox.ai-secretary.rag.enabled=true',
  '-Dtoolbox.ai-secretary.rag.qdrant-host=170.106.186.65',
  '-Dtoolbox.ai-secretary.rag.qdrant-port=6334',
  "-Dtoolbox.ai-secretary.rag.qdrant-api-key=$ragApiKey",
  # Java 八股秘书 RAG（独立集合 java8gu_cards，复用同一 Qdrant/密钥）
  '-Dtoolbox.java8gu.rag.enabled=true',
  '-Dtoolbox.java8gu.rag.qdrant-host=170.106.186.65',
  '-Dtoolbox.java8gu.rag.qdrant-port=6334',
  "-Dtoolbox.java8gu.rag.qdrant-api-key=$ragApiKey"
) -join ' '

Write-Host '[run-backend] 启动 toolbox-starter（个人秘书 + Java八股 RAG 已启用 → 远端 Qdrant 170.106.186.65:6334）...'
& $mvn -pl toolbox-starter spring-boot:run "-Dspring-boot.run.jvmArguments=$ragJvmArgs"
