#requires -Version 5.1
<#
.SYNOPSIS
  Read-only local HeavenzFire and Ollama endpoint diagnostics.
.DESCRIPTION
  Uses bounded HTTP requests and reports observed responses. Does not restart,
  configure, install, or stop anything. Compatible with Windows PowerShell 5.1.
#>
[CmdletBinding()]
param(
    [ValidateRange(1,30)]
    [int]$TimeoutSeconds = 3,
    [string]$OllamaUrl = 'http://127.0.0.1:11434/api/tags',
    [string]$GatewayUrl = 'http://127.0.0.1:8787/health',
    [string]$OrchestratorUrl = 'http://127.0.0.1:8788/health',
    [string]$AgentUrl = 'http://127.0.0.1:8790/health'
)

$ErrorActionPreference = 'Stop'
$targets = @(
    [pscustomobject]@{ Name = 'Ollama'; Url = $OllamaUrl },
    [pscustomobject]@{ Name = 'HeavenzFire Gateway'; Url = $GatewayUrl },
    [pscustomobject]@{ Name = 'HeavenzFire Orchestrator'; Url = $OrchestratorUrl },
    [pscustomobject]@{ Name = 'HeavenzFire Agent'; Url = $AgentUrl }
)

$results = foreach ($target in $targets) {
    $started = Get-Date
    try {
        $response = Invoke-WebRequest -Uri $target.Url -Method Get -TimeoutSec $TimeoutSeconds -UseBasicParsing
        $status = [int]$response.StatusCode
        [pscustomobject]@{
            Name = $target.Name
            Url = $target.Url
            Reachable = ($status -ge 200 -and $status -lt 500)
            HttpStatus = $status
            ElapsedMs = [int]((Get-Date) - $started).TotalMilliseconds
            Detail = if ($status -ge 200 -and $status -lt 300) { 'HTTP success' } else { 'HTTP response; inspect service status' }
            CheckedAt = (Get-Date).ToString('o')
        }
    }
    catch {
        $detail = $_.Exception.Message
        if ($detail.Length -gt 180) { $detail = $detail.Substring(0,180) }
        [pscustomobject]@{
            Name = $target.Name
            Url = $target.Url
            Reachable = $false
            HttpStatus = $null
            ElapsedMs = [int]((Get-Date) - $started).TotalMilliseconds
            Detail = $detail
            CheckedAt = (Get-Date).ToString('o')
        }
    }
}

$results | Format-Table -AutoSize -Wrap
$failed = @($results | Where-Object { -not $_.Reachable }).Count
Write-Output ("Summary: {0} endpoints checked; {1} unreachable. No changes made." -f $results.Count, $failed)
if ($failed -gt 0) { exit 2 }
exit 0
