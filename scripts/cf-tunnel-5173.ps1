<# Compatibility entry point. Runtime control belongs to forge.mjs. #>
param(
  [switch]$Named,
  [switch]$Setup,
  [int]$Port = 5173,
  [ValidateSet('http', 'https')][string]$Scheme = 'https',
  [ValidateSet('http2', 'quic', 'auto')][string]$Protocol = 'http2',
  [string]$Hostname = 'kai-tool.exception-coder.com',
  [string]$TunnelName = 'kai-toolbox',
  [string]$Proxy = ''
)
$ErrorActionPreference = 'Stop'
if ($Setup) { throw 'Remote setup is not automatic. Restore existing config/credentials, then use node forge.mjs tunnel start.' }
if ($PSBoundParameters.ContainsKey('Hostname') -or $PSBoundParameters.ContainsKey('TunnelName')) {
  throw 'Named hostname and tunnel identity belong to the existing config.yml. Use node forge.mjs tunnel start --config PATH.'
}
if ($Proxy) { $env:HTTPS_PROXY = $Proxy; $env:HTTP_PROXY = $Proxy }
$forgeArgs = @('tunnel', 'start', '--protocol', $Protocol)
if (-not $Named) { $forgeArgs += @('--quick', '--url', "${Scheme}://localhost:$Port") }
& node (Join-Path (Split-Path -Parent $PSScriptRoot) 'forge.mjs') @forgeArgs
exit $LASTEXITCODE
