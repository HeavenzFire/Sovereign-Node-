[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [ValidateSet("Init", "Add", "List", "Verify", "Export")]
    [string]$Action,

    [string]$File,
    [string]$CaseId,
    [string]$OutFile,
    [string]$VaultPath = (Join-Path $env:LOCALAPPDATA "HeavenzFire\GuardianVault\cases"),
    [string]$KeyPath = (Join-Path $env:LOCALAPPDATA "HeavenzFire\GuardianVault\vault.key")
)

$ErrorActionPreference = "Stop"
$Python = Get-Command py -ErrorAction SilentlyContinue
if (-not $Python) {
    Write-Error "Python launcher 'py' was not found. Install Python 3.10+ and enable the Python launcher."
    exit 2
}

$Script = Join-Path $PSScriptRoot "vault.py"
if (-not (Test-Path -LiteralPath $Script -PathType Leaf)) {
    Write-Error "Vault engine not found: $Script"
    exit 2
}

$ArgsList = @($Script, $Action.ToLowerInvariant(), "--vault", $VaultPath)
if ($Action -ne "List") {
    $ArgsList += @("--key", $KeyPath)
}
switch ($Action) {
    "Add" {
        if ([string]::IsNullOrWhiteSpace($File)) { throw "Add requires -File <path>." }
        $ArgsList += @("--file", $File)
    }
    "Export" {
        if ([string]::IsNullOrWhiteSpace($CaseId)) { throw "Export requires -CaseId <id>." }
        if ([string]::IsNullOrWhiteSpace($OutFile)) { throw "Export requires -OutFile <path>." }
        $ArgsList += @("--case-id", $CaseId, "--out", $OutFile)
    }
}

& py @ArgsList
$ExitCode = $LASTEXITCODE
if ($ExitCode -ne 0) {
    Write-Error "Guardian vault command failed with exit code $ExitCode."
    exit $ExitCode
}
