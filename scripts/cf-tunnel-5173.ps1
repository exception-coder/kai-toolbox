<#
.SYNOPSIS
  下载 cloudflared 并用 Quick Tunnel 把本机 5173 端口暴露为公网 HTTPS。

.DESCRIPTION
  Cloudflare Quick Tunnel:免登录、免域名,自动分配一个
  https://<随机>.trycloudflare.com 地址,公网侧走 HTTPS,
  回源到本机 http://localhost:5173(Vite dev server)。

  cloudflared.exe 缓存在 %USERPROFILE%\.kai-toolbox\bin\,只下载一次。

.PARAMETER Port
  要代理的本机端口,默认 5173。

.PARAMETER Scheme
  回源协议,默认 https。本仓 Vite dev 用 vite-plugin-mkcert 起的是 HTTPS,
  且证书是本机自签,cloudflared 回源时会自动加 --no-tls-verify 跳过校验。
  若改回明文 http,传 -Scheme http。

.EXAMPLE
  ./scripts/cf-tunnel-5173.ps1
  ./scripts/cf-tunnel-5173.ps1 -Port 5173
#>
param(
  [int]$Port = 5173,
  [ValidateSet('http', 'https')]
  [string]$Scheme = 'https',
  # 与 Cloudflare 边缘的传输协议。默认 http2(走 TCP/443)：很多网络/代理(如 Clash)封禁或不转发
  # cloudflared 默认 quic 用的 UDP/7844,会一直 "Failed to dial a quic connection" 超时重连。
  # 网络允许 UDP 出站时可传 -Protocol quic(更优),或 -Protocol auto 让其自动回退。
  [ValidateSet('http2', 'quic', 'auto')]
  [string]$Protocol = 'http2'
)

$ErrorActionPreference = 'Stop'

$binDir = Join-Path $env:USERPROFILE '.kai-toolbox\bin'
$exe = Join-Path $binDir 'cloudflared.exe'
$downloadUrl = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe'

if (-not (Test-Path $binDir)) {
  New-Item -ItemType Directory -Path $binDir -Force | Out-Null
}

if (-not (Test-Path $exe)) {
  Write-Host "[cf-tunnel] 首次运行,下载 cloudflared ..." -ForegroundColor Cyan
  Write-Host "[cf-tunnel] 来源: $downloadUrl"
  # 用 curl.exe(Windows 10+ 自带)下载,带重定向跟随
  & curl.exe -L --fail -o $exe $downloadUrl
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path $exe)) {
    throw "cloudflared 下载失败,请检查网络或代理。"
  }
  Write-Host "[cf-tunnel] 已保存到 $exe" -ForegroundColor Green
}
else {
  Write-Host "[cf-tunnel] 使用已缓存的 cloudflared: $exe" -ForegroundColor DarkGray
}

$target = "${Scheme}://localhost:$Port"
Write-Host ""
Write-Host "[cf-tunnel] 正在为 $target 建立 Quick Tunnel ..." -ForegroundColor Cyan
Write-Host "[cf-tunnel] 等待下方出现 https://<...>.trycloudflare.com 地址,Ctrl+C 结束。" -ForegroundColor Yellow
Write-Host ""

# --no-autoupdate 避免运行中自动更新打断;Quick Tunnel 无需登录。
# https 回源时本机是 mkcert 自签证书,cloudflared 默认会拒连,
# 加 --no-tls-verify 跳过证书校验(仅回源到 localhost,公网侧仍是 Cloudflare 的可信 TLS)。
# --protocol：避开默认 quic(UDP/7844)在受限网络/代理下连不上的问题（见 param 注释）。
$cfArgs = @('tunnel', '--no-autoupdate', '--protocol', $Protocol, '--url', $target)
if ($Scheme -eq 'https') {
  $cfArgs += '--no-tls-verify'
}
Write-Host "[cf-tunnel] edge 传输协议: $Protocol（受限网络下 quic/UDP 7844 常被封，故默认 http2）" -ForegroundColor DarkGray
& $exe @cfArgs
