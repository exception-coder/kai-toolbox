<#
.SYNOPSIS
  下载 cloudflared 并把本机端口(默认 5173)暴露为公网 HTTPS。
  支持两种模式:Quick Tunnel(免登录临时地址) 与 Named Tunnel(固定域名、断线重连稳定)。

.DESCRIPTION
  ── 模式一:Quick Tunnel(默认,不带 -Named)──
    免登录、免域名,自动分配一个 https://<随机>.trycloudflare.com 地址。
    临时、尽力而为:Cloudflare 边缘随时可能回收临时隧道,断线重连时会报
    "Unauthorized: Tunnel not found" 死循环 —— 此时 Ctrl+C 重跑换个新地址即可。
    适合临时演示 / 自己用,零配置。

  ── 模式二:Named Tunnel(带 -Named,需要一个自有域名)──
    隧道持久注册在 Cloudflare 后台,绑定你自己的固定域名(如 kai.example.com),
    断线重连永远能找到,不会再出现 "Tunnel not found"。
    功能本身免费(Cloudflare Zero Trust 免费版),唯一成本是域名。

    首次需先在 Cloudflare 添加你的域名(改 NS 到 Cloudflare),然后:
      ./scripts/cf-tunnel-5173.ps1 -Named -Setup -Hostname kai.example.com
    这会:① 浏览器授权登录 → 拿 cert.pem;② 创建命名隧道;
          ③ 自动写 DNS CNAME;④ 生成 config.yml。
    之后日常启动只需:
      ./scripts/cf-tunnel-5173.ps1 -Named

  cloudflared.exe 缓存在 %USERPROFILE%\.kai-toolbox\bin\,只下载一次。
  命名隧道的凭证/配置放在 %USERPROFILE%\.kai-toolbox\cloudflared\。

.PARAMETER Port
  要代理的本机端口,默认 5173。

.PARAMETER Scheme
  回源协议,默认 https。本仓 Vite dev 用 vite-plugin-mkcert 起的是 HTTPS,
  且证书是本机自签,cloudflared 回源时会自动跳过证书校验(noTLSVerify)。
  若改回明文 http,传 -Scheme http。

.PARAMETER Protocol
  与 Cloudflare 边缘的传输协议,默认 http2(走 TCP/443)。
  受限网络/代理(如 Clash)常封 quic 的 UDP/7844,故默认 http2;
  网络允许 UDP 出站时可传 -Protocol quic(更优)或 -Protocol auto 自动回退。

.PARAMETER Named
  切换到命名隧道模式(需要自有域名)。不带此开关即默认 Quick Tunnel。

.PARAMETER Setup
  仅命名隧道模式:执行一次性初始化(login / create / route dns / 写 config.yml)。
  配合 -Named -Hostname 使用。已初始化过则会跳过已完成的步骤。

.PARAMETER Hostname
  命名隧道绑定的公网域名,如 kai.example.com。-Setup 时必填。

.PARAMETER TunnelName
  命名隧道的名字,默认 kai-toolbox。

.PARAMETER Proxy
  cloudflared 访问 Cloudflare(api.cloudflare.com 与边缘)走的代理,如 http://127.0.0.1:7897。
  cloudflared 是 Go 程序不读 Windows 系统代理,靠代理上网时必须显式传;不传则复用当前 shell 已有的
  HTTPS_PROXY/ALL_PROXY/HTTP_PROXY(若有)。直连被墙/被重置报 EOF 时用它。

.EXAMPLE
  # Quick Tunnel(临时随机地址,零配置)
  ./scripts/cf-tunnel-5173.ps1

.EXAMPLE
  # 命名隧道:首次初始化(把 example.com 换成你的域名)
  ./scripts/cf-tunnel-5173.ps1 -Named -Setup -Hostname kai.example.com

.EXAMPLE
  # 命名隧道:日常启动
  ./scripts/cf-tunnel-5173.ps1 -Named
#>
param(
  [int]$Port = 5173,
  [ValidateSet('http', 'https')]
  [string]$Scheme = 'https',
  [ValidateSet('http2', 'quic', 'auto')]
  [string]$Protocol = 'http2',
  [switch]$Named,
  [switch]$Setup,
  [string]$Hostname,
  [string]$TunnelName = 'kai-toolbox',
  [string]$Proxy = ''
)

$ErrorActionPreference = 'Stop'

# cloudflared 是 Go 程序,【不读 Windows 系统代理(WinINET)】,只认 HTTPS_PROXY/HTTP_PROXY/ALL_PROXY 环境变量。
# 若本机靠 Clash 等代理上网(直连被墙/被重置报 EOF),必须把代理经环境变量传进来,否则连不上 api.cloudflare.com 与边缘。
# 传 -Proxy http://127.0.0.1:7897;不传则复用当前 shell 已有的代理环境变量(若有)。
if (-not $Proxy) {
  foreach ($v in @($env:HTTPS_PROXY, $env:ALL_PROXY, $env:HTTP_PROXY)) { if ($v) { $Proxy = $v; break } }
}
if ($Proxy) {
  $env:HTTPS_PROXY = $Proxy
  $env:HTTP_PROXY = $Proxy
  $env:ALL_PROXY = $Proxy
  # 别把到本机端口(回源 localhost)的流量也走代理
  $env:NO_PROXY = 'localhost,127.0.0.1'
  Write-Host "[cf-tunnel] 经代理访问 Cloudflare: $Proxy" -ForegroundColor DarkGray
}

$binDir = Join-Path $env:USERPROFILE '.kai-toolbox\bin'
$exe = Join-Path $binDir 'cloudflared.exe'
$downloadUrl = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe'

# 命名隧道的凭证/配置目录(与 Quick 模式互不干扰)
$cfHome = Join-Path $env:USERPROFILE '.kai-toolbox\cloudflared'
$certPem = Join-Path $cfHome 'cert.pem'
$configYml = Join-Path $cfHome 'config.yml'
$credJson = Join-Path $cfHome "$TunnelName.json"

if (-not (Test-Path $binDir)) {
  New-Item -ItemType Directory -Path $binDir -Force | Out-Null
}

# ── 确保 cloudflared.exe 存在 ──
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

# ════════════════════════════════════════════════════════════════════
# 模式一:Quick Tunnel(默认)
# ════════════════════════════════════════════════════════════════════
if (-not $Named) {
  Write-Host ""
  Write-Host "[cf-tunnel] 模式: Quick Tunnel(临时随机地址)" -ForegroundColor Cyan
  Write-Host "[cf-tunnel] 正在为 $target 建立 Quick Tunnel ..." -ForegroundColor Cyan
  Write-Host "[cf-tunnel] 等待下方出现 https://<...>.trycloudflare.com 地址,Ctrl+C 结束。" -ForegroundColor Yellow
  Write-Host "[cf-tunnel] 提示: 若刷出 'Tunnel not found' 重连死循环,Ctrl+C 重跑即可换新地址。" -ForegroundColor DarkGray
  Write-Host ""

  # --no-autoupdate 避免运行中自动更新打断;Quick Tunnel 无需登录。
  # https 回源时本机是 mkcert 自签证书,加 --no-tls-verify 跳过校验(仅回源到 localhost)。
  $cfArgs = @('tunnel', '--no-autoupdate', '--protocol', $Protocol, '--url', $target)
  if ($Scheme -eq 'https') {
    $cfArgs += '--no-tls-verify'
  }
  Write-Host "[cf-tunnel] edge 传输协议: $Protocol（受限网络下 quic/UDP 7844 常被封，故默认 http2）" -ForegroundColor DarkGray
  & $exe @cfArgs
  return
}

# ════════════════════════════════════════════════════════════════════
# 模式二:Named Tunnel(固定域名)
# ════════════════════════════════════════════════════════════════════
if (-not (Test-Path $cfHome)) {
  New-Item -ItemType Directory -Path $cfHome -Force | Out-Null
}
# 让所有 cloudflared 子命令都用本仓自管的 cert.pem,不污染默认 ~/.cloudflared
$env:TUNNEL_ORIGIN_CERT = $certPem

# ── 一次性初始化 ──
if ($Setup) {
  if ([string]::IsNullOrWhiteSpace($Hostname)) {
    throw "-Setup 需要 -Hostname,例如: -Named -Setup -Hostname kai.example.com"
  }

  Write-Host ""
  Write-Host "[cf-tunnel] 命名隧道初始化,域名: $Hostname,隧道名: $TunnelName" -ForegroundColor Cyan

  # ① 登录授权:浏览器选中你已添加到 Cloudflare 的域名,下载 cert.pem
  if (-not (Test-Path $certPem)) {
    Write-Host "[cf-tunnel] ① 即将打开浏览器授权登录,请选择你的域名所在的 zone ..." -ForegroundColor Yellow
    & $exe tunnel login
    # cloudflared tunnel login 不认 TUNNEL_ORIGIN_CERT 输出路径,总把 cert.pem 写到默认 ~\.cloudflared\,
    # 自动搬到本仓自管目录,免去手动拷贝。
    if (-not (Test-Path $certPem)) {
      $defaultCert = Join-Path $env:USERPROFILE '.cloudflared\cert.pem'
      if (Test-Path $defaultCert) {
        Copy-Item $defaultCert $certPem -Force
        Write-Host "[cf-tunnel]   已从默认位置拷入 cert.pem: $defaultCert" -ForegroundColor DarkGray
      }
    }
    if (-not (Test-Path $certPem)) {
      throw "登录后未找到 cert.pem(已查 $certPem 及默认 ~\.cloudflared\cert.pem)。请确认域名已添加到 Cloudflare 并完成授权。"
    }
    Write-Host "[cf-tunnel]   cert.pem 已就绪: $certPem" -ForegroundColor Green
  }
  else {
    Write-Host "[cf-tunnel] ① cert.pem 已存在,跳过登录。" -ForegroundColor DarkGray
  }

  # ② 创建命名隧道(若同名隧道已存在则复用)
  # 注意:cloudflared 会往 stderr 打「版本过时」等日志;PS5.1 在 $ErrorActionPreference='Stop' 下会把
  # 捕获到的原生 stderr(这里 2>$null 捕获了)当成终止错误抛出。故临时降为 Continue 再调,JSON 解析再容错。
  $existing = $null
  $prevEap = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try { $listOut = & $exe tunnel list --output json 2>$null } finally { $ErrorActionPreference = $prevEap }
  if ($listOut) {
    try { $existing = ($listOut | ConvertFrom-Json) | Where-Object { $_.name -eq $TunnelName } } catch { $existing = $null }
  }
  if (-not $existing) {
    Write-Host "[cf-tunnel] ② 创建命名隧道 $TunnelName ..." -ForegroundColor Yellow
    # 带重试:到 api.cloudflare.com 的调用可能被代理/网络瞬时切断(EOF)。凭证 json 生成 = 创建成功的确证。
    for ($i = 1; $i -le 3 -and -not (Test-Path $credJson); $i++) {
      if ($i -gt 1) { Write-Host "[cf-tunnel]   创建未成功，重试 $i/3 ..." -ForegroundColor DarkGray; Start-Sleep -Seconds 2 }
      & $exe tunnel create --credentials-file $credJson $TunnelName
    }
    if (-not (Test-Path $credJson)) {
      throw @"
创建命名隧道失败:到 api.cloudflare.com 的请求被切断(EOF),未生成凭证 $credJson。
cloudflared 不读 Windows 系统代理,直连被墙/被重置。若你本机靠代理上网(如 Clash 7897),请带上 -Proxy 重跑:
  .\scripts\cf-tunnel-5173.ps1 -Named -Setup -Hostname $Hostname -Proxy http://127.0.0.1:7897
其它可能:
  1) EOF 偶发,直接重试;
  2) 或在 Cloudflare 后台手动建隧道,把凭证 json 放到 $credJson。
(隧道未建成前不写 DNS/config、不启动,避免后续 'credentials file doesn't exist' 的误导报错。)
"@
    }
  }
  else {
    Write-Host "[cf-tunnel] ② 隧道 $TunnelName 已存在(UUID=$($existing.id)),跳过创建。" -ForegroundColor DarkGray
    # 凭证文件可能不在本目录,补导出一次
    if (-not (Test-Path $credJson)) {
      Write-Host "[cf-tunnel]   未找到本地凭证 $credJson,请确认 ~/.cloudflared 下是否有 $($existing.id).json" -ForegroundColor Yellow
    }
  }

  # ③ 自动写 DNS CNAME:$Hostname -> 隧道
  Write-Host "[cf-tunnel] ③ 绑定 DNS: $Hostname -> $TunnelName ..." -ForegroundColor Yellow
  & $exe tunnel route dns $TunnelName $Hostname

  # ④ 生成 config.yml(ingress 路由到本机端口)
  Write-Host "[cf-tunnel] ④ 写入配置 $configYml ..." -ForegroundColor Yellow
  $noTls = if ($Scheme -eq 'https') { "      noTLSVerify: true`n" } else { "" }
  $config = @"
tunnel: $TunnelName
credentials-file: $credJson

ingress:
  - hostname: $Hostname
    service: $target
    originRequest:
$noTls  - service: http_status:404
"@
  # 无 BOM 写：cloudflared 的 YAML 解析器遇到 UTF-8 BOM 会报解析错（PS5.1 的 Set-Content -Encoding UTF8 会带 BOM）
  [System.IO.File]::WriteAllText($configYml, $config, (New-Object System.Text.UTF8Encoding($false)))
  Write-Host ""
  Write-Host "[cf-tunnel] 初始化完成 ✅  之后日常启动只需: ./scripts/cf-tunnel-5173.ps1 -Named" -ForegroundColor Green
  Write-Host "[cf-tunnel] 现在直接启动该隧道 ..." -ForegroundColor Cyan
  Write-Host ""
}

# ── 启动命名隧道 ──
if (-not (Test-Path $configYml)) {
  throw "未找到命名隧道配置 $configYml。请先执行一次初始化: -Named -Setup -Hostname <你的域名>"
}
if (-not (Test-Path $credJson)) {
  throw "未找到隧道凭证 $credJson（隧道可能没创建成功，多为到 api.cloudflare.com 的网络被切断)。请重跑: -Named -Setup -Hostname <你的域名>（见其错误提示排查代理/网络）。"
}

Write-Host ""
Write-Host "[cf-tunnel] 模式: Named Tunnel(固定域名,$TunnelName)" -ForegroundColor Cyan
Write-Host "[cf-tunnel] edge 传输协议: $Protocol" -ForegroundColor DarkGray
Write-Host "[cf-tunnel] 回源目标: $target,Ctrl+C 结束。" -ForegroundColor Yellow
Write-Host ""
& $exe tunnel --no-autoupdate --protocol $Protocol --config $configYml run
