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

# --- 解析 mvn：优先 PATH，回退到本机已知安装 ---
function Resolve-Mvn {
  $c = Get-Command mvn -ErrorAction SilentlyContinue
  if ($c) { return $c.Source }
  foreach ($p in @('D:\devapps\apache-maven-3.9.9\bin\mvn.cmd')) {
    if (Test-Path $p) { return $p }
  }
  throw 'mvn 未找到：请把 Maven 的 bin 目录加入 PATH，或修改本脚本的回退路径'
}
$mvn = Resolve-Mvn

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

# --- 4. 启动后端 ---
Write-Host '[run-backend] 启动 toolbox-starter ...'
& $mvn -pl toolbox-starter spring-boot:run
