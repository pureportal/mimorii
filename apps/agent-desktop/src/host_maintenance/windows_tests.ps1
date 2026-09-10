$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$script:searchResultCode = 2
$script:rebootRequired = $true
$script:securityReadable = $true
$script:updates = @(
    [pscustomobject]@{ Title = 'Security update KB1'; MsrcSeverity = 'Important'; Categories = @([pscustomobject]@{ CategoryID = '0fa1201d-4330-4fa8-8ae9-b877473b6441' }) },
    [pscustomobject]@{ Title = 'Critical update KB2'; MsrcSeverity = ''; Categories = @([pscustomobject]@{ CategoryID = 'e6cf1350-c01b-414d-a61f-263d14d133b4' }) },
    [pscustomobject]@{ Title = 'Software update KB3'; MsrcSeverity = ''; Categories = @() }
)

function New-Object([string]$ComObject) {
    switch ($ComObject) {
        'Microsoft.Update.SystemInfo' { return [pscustomobject]@{ RebootRequired = $script:rebootRequired } }
        'HNetCfg.FwPolicy2' {
            $policy = [pscustomobject]@{ CurrentProfileTypes = 4 }
            $policy | Add-Member ScriptMethod FirewallEnabled { param($profile) return $false }
            return $policy
        }
        'Microsoft.Update.AutoUpdate' { return [pscustomobject]@{ Results = [pscustomobject]@{ LastSearchSuccessDate = [DateTime]::UtcNow.AddHours(-2) } } }
        'Microsoft.Update.Session' {
            $session = [pscustomobject]@{ ClientApplicationID = '' }
            $session | Add-Member ScriptMethod CreateUpdateSearcher {
                $searcher = [pscustomobject]@{ Online = $true }
                $searcher | Add-Member ScriptMethod Search {
                    param($criteria)
                    if ($this.Online -or $criteria -ne "IsInstalled = 0 and Type = 'Software'") { throw 'Unexpected update search' }
                    return [pscustomobject]@{ ResultCode = $script:searchResultCode; Updates = $script:updates }
                }
                return $searcher
            }
            return $session
        }
        default { throw "Unexpected COM object: $ComObject" }
    }
}

function Test-Path([string]$LiteralPath) { return $false }

function Get-MpComputerStatus {
    [CmdletBinding()]
    param()
    if (-not $script:securityReadable) { throw 'Denied' }
    return [pscustomobject]@{ AMRunningMode = 'Normal'; AMServiceEnabled = $true; AntivirusEnabled = $true; RealTimeProtectionEnabled = $false }
}

function Get-CimInstance {
    [CmdletBinding()]
    param([string]$ClassName, [string]$Filter)
    if ($ClassName -ne 'Win32_Service' -or $Filter -ne "StartMode = 'Auto' AND State = 'Stopped' AND ExitCode <> 0") { throw 'Unexpected service query' }
    return [pscustomobject]@{ Name = 'FailedService'; ExitCode = 1066 }
}

function Read-Assessments {
    $writer = [System.IO.StringWriter]::new()
    $previous = [Console]::Out
    try {
        [Console]::SetOut($writer)
        . (Join-Path $PSScriptRoot 'windows.ps1')
    } finally {
        [Console]::SetOut($previous)
    }
    $results = @{}
    foreach ($line in $writer.ToString().Split([Environment]::NewLine, [StringSplitOptions]::RemoveEmptyEntries)) {
        $record = $line | ConvertFrom-Json
        $results[$record.check] = $record.result
    }
    return $results
}

foreach ($key in @('REBOOT', 'SECURITY', 'SERVICES', 'UPDATES')) {
    [Environment]::SetEnvironmentVariable("MIMORII_ASSESS_$key", '1', 'Process')
}
$results = Read-Assessments
if ($results.updates.status -ne 'available' -or $results.updates.data.count -ne 3 -or $results.updates.data.securityCount -ne 2) { throw 'Update classification failed' }
if ($results.updates.data.dataAgeHours -lt 1.9 -or $results.updates.data.dataAgeHours -gt 2.1) { throw 'Update freshness failed' }
if ($results.reboot.data.count -ne 1) { throw 'Restart detection failed' }
if ($results.security.data.count -ne 2) { throw 'Security detection failed' }
if ($results.services.data.count -ne 1) { throw 'Failed service detection failed' }
$script:securityReadable = $false
$script:searchResultCode = 3
$results = Read-Assessments
if ($results.updates.status -ne 'unavailable') { throw 'Incomplete update search passed' }
if ($results.security.data.count -ne 1 -or $results.security.data.unavailable.Count -ne 1) { throw 'Partial security result was lost' }
foreach ($key in @('REBOOT', 'SECURITY', 'SERVICES', 'UPDATES')) {
    [Environment]::SetEnvironmentVariable("MIMORII_ASSESS_$key", '0', 'Process')
}
if ((Read-Assessments).Count -ne 0) { throw 'Disabled probes returned results' }
Write-Output 'Windows maintenance probe tests passed'
