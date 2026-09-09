param(
    [Parameter(Position = 0)]
    [ValidateSet("detect", "init", "check", "verify")]
    [string]$Command = "verify",
    [ValidateSet("all", "static", "runtime")]
    [string]$Phase = "all",
    [string]$Project = ".",
    [ValidateSet("human", "json")]
    [string]$Format = "human"
)

$repoRoot = Split-Path -Parent $PSScriptRoot
$jarPath = Join-Path $repoRoot "forge-quality/forge-quality-cli/target/forge-quality-cli.jar"

if (-not (Test-Path -LiteralPath $jarPath)) {
    & mvn -f (Join-Path $repoRoot "pom.xml") -pl forge-quality/forge-quality-cli -am package -DskipTests
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }
}

if ($Command -eq "verify") {
    & java -jar $jarPath verify $Phase --project $Project --format $Format
} else {
    & java -jar $jarPath quality $Command --project $Project --format $Format
}
exit $LASTEXITCODE
