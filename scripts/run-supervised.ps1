# kai-toolbox 后端守护脚本
#
# 循环跑 spring-boot:run；进程退出（远程重启 / 崩溃）即自动「重新编译 + 拉起」，
# 从而远程触发重启就能应用磁盘上最新的 Java 代码。
# 前端不在此管，照常 `npm run dev` 自热更，故 -Dskip.frontend=true（只快起后端）。
#
# 用法：用本脚本取代 IntelliJ 的运行按钮启动后端：
#   pwsh -File scripts\run-supervised.ps1
# 远程重启（手机）：先在 application.yml / 环境变量配好 token，再
#   POST https://<你的域名>/api/system/restart?token=<token>
#
# Ctrl+C 可彻底停止守护循环。

$ErrorActionPreference = 'Continue'

# === 配置：填你的 mvn.cmd 全路径；留空则用 PATH 上的 mvn（本机 PATH 无 mvn，请务必填）===
$MvnCmd = ''   # 例：'D:\apps\apache-maven-3.9.9\bin\mvn.cmd'
if ([string]::IsNullOrWhiteSpace($MvnCmd)) { $MvnCmd = 'mvn' }

# 仓库根 = 本脚本所在 scripts\ 的上一级
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

Write-Host "[supervisor] repo=$RepoRoot  mvn=$MvnCmd"
while ($true) {
    Write-Host "[supervisor] $(Get-Date -Format 'HH:mm:ss') 编译 + 启动后端…"
    & $MvnCmd -pl toolbox-starter -am -Dskip.frontend=true spring-boot:run
    $code = $LASTEXITCODE
    Write-Host "[supervisor] $(Get-Date -Format 'HH:mm:ss') 后端退出 (code=$code)，2s 后重起（编译错误会一直重试，改好代码即自动起来）"
    Start-Sleep -Seconds 2
}
