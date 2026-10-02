param(
  [Parameter(Mandatory = $true)]
  [string]$Label,
  [ValidateRange(3, 120)]
  [int]$SampleSeconds = 5
)

$ErrorActionPreference = "Stop"

function Get-LivelyProcessIds {
  $processes = @(Get-CimInstance Win32_Process)
  $roots = @($processes | Where-Object { $_.Name -in @("Lively.exe", "Lively.Watchdog.exe") })
  if ($roots.Count -eq 0) { throw "Lively is not running." }

  $ids = [System.Collections.Generic.HashSet[int]]::new()
  foreach ($root in $roots) { [void]$ids.Add([int]$root.ProcessId) }
  $changed = $true
  while ($changed) {
    $changed = $false
    foreach ($process in $processes) {
      if ($ids.Contains([int]$process.ParentProcessId) -and $ids.Add([int]$process.ProcessId)) {
        $changed = $true
      }
    }
  }
  return @($ids)
}

function Get-GpuUsage([int[]]$ProcessIds) {
  $paths = @(
    "\GPU Process Memory(*)\Dedicated Usage",
    "\GPU Process Memory(*)\Shared Usage",
    "\GPU Process Memory(*)\Total Committed",
    "\GPU Engine(*)\Utilization Percentage"
  )
  try {
    $samples = (Get-Counter -Counter $paths -MaxSamples 1).CounterSamples
  } catch {
    return @{ Dedicated = $null; Shared = $null; Committed = $null; Utilization = $null }
  }

  $values = @{ Dedicated = [int64]0; Shared = [int64]0; Committed = [int64]0; Utilization = [double]0 }
  foreach ($sample in $samples) {
    if ($sample.Path -notmatch 'pid_(\d+)_') { continue }
    if ([int]$Matches[1] -notin $ProcessIds) { continue }
    if ($sample.Path -match '\\dedicated usage$') { $values.Dedicated += [int64]$sample.CookedValue }
    elseif ($sample.Path -match '\\shared usage$') { $values.Shared += [int64]$sample.CookedValue }
    elseif ($sample.Path -match '\\total committed$') { $values.Committed += [int64]$sample.CookedValue }
    elseif ($sample.Path -match '\\utilization percentage$') { $values.Utilization += [double]$sample.CookedValue }
  }
  return $values
}

function Get-Summary($Values) {
  $numbers = @($Values | Where-Object { $null -ne $_ })
  if ($numbers.Count -eq 0) { return $null }
  $measure = $numbers | Measure-Object -Minimum -Maximum -Average
  return [ordered]@{
    min = [int64]$measure.Minimum
    average = [int64]$measure.Average
    max = [int64]$measure.Maximum
  }
}

$logicalProcessors = [Environment]::ProcessorCount
$samples = @()
$previousCpu = $null
$previousTime = $null

for ($index = 0; $index -lt $SampleSeconds; $index += 1) {
  $ids = @(Get-LivelyProcessIds)
  $processes = @(Get-Process -Id $ids -ErrorAction SilentlyContinue)
  $now = Get-Date
  $cpuSeconds = ($processes | Measure-Object CPU -Sum).Sum
  $cpuPercent = $null
  if ($null -ne $previousCpu -and $null -ne $previousTime) {
    $elapsed = ($now - $previousTime).TotalSeconds
    if ($elapsed -gt 0) {
      $cpuPercent = (($cpuSeconds - $previousCpu) / $elapsed / $logicalProcessors) * 100
    }
  }
  $gpu = Get-GpuUsage $ids
  $samples += [pscustomobject]@{
    WorkingSet = [int64](($processes | Measure-Object WorkingSet64 -Sum).Sum)
    PrivateBytes = [int64](($processes | Measure-Object PrivateMemorySize64 -Sum).Sum)
    DedicatedGpu = $gpu.Dedicated
    SharedGpu = $gpu.Shared
    CommittedGpu = $gpu.Committed
    GpuUtilization = $gpu.Utilization
    CpuPercent = $cpuPercent
    ProcessCount = $processes.Count
  }
  $previousCpu = $cpuSeconds
  $previousTime = $now
  if ($index -lt $SampleSeconds - 1) { Start-Sleep -Seconds 1 }
}

$result = [ordered]@{
  label = $Label
  capturedAt = (Get-Date).ToString("o")
  sampleSeconds = $SampleSeconds
  scope = "Total Lively.exe, Lively.Watchdog.exe, and descendant processes"
  processCount = Get-Summary ($samples.ProcessCount)
  workingSetBytes = Get-Summary ($samples.WorkingSet)
  privateBytes = Get-Summary ($samples.PrivateBytes)
  dedicatedGpuBytes = Get-Summary ($samples.DedicatedGpu)
  sharedGpuBytes = Get-Summary ($samples.SharedGpu)
  committedGpuBytes = Get-Summary ($samples.CommittedGpu)
  gpuEnginePercentSum = Get-Summary ($samples.GpuUtilization)
  cpuPercentOfMachine = Get-Summary ($samples.CpuPercent)
}

$result | ConvertTo-Json -Depth 5
