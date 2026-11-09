# Autopilot P2.5 / database security doc section 14: local preview, Windows PowerShell 5.1.
# Mohamed runs this script himself. It never writes credentials or starts a background web server.
$ErrorActionPreference = 'Stop'
$previewRoot = Split-Path -Parent $PSScriptRoot
$previewDbDirectory = Join-Path $previewRoot 'packages\db'
$previewStep = 'قراءة إعدادات المعاينة'

function Read-PreviewDatabaseEnvironment {
  $file = Join-Path $previewDbDirectory '.env'
  if (-not (Test-Path -LiteralPath $file -PathType Leaf)) {
    throw 'missing-database-environment'
  }
  $values = @{}
  foreach ($line in [System.IO.File]::ReadAllLines($file)) {
    $match = [regex]::Match($line, '^\s*(?:export\s+)?(DATABASE_URL(?:_SERVICE)?)\s*=\s*(.*)$')
    if (-not $match.Success) { continue }
    $key = $match.Groups[1].Value
    $value = $match.Groups[2].Value.Trim()
    if ($value.StartsWith('"') -or $value.StartsWith("'")) {
      $quote = $value.Substring(0, 1)
      $end = $value.IndexOf($quote, 1)
      if ($end -lt 1) { throw 'invalid-database-environment' }
      $tail = $value.Substring($end + 1).Trim()
      if ($tail -and -not $tail.StartsWith('#')) { throw 'invalid-database-environment' }
      $value = $value.Substring(1, $end - 1)
    } else {
      $value = ($value -split '#', 2)[0].Trim()
    }
    $values[$key] = $value
  }
  if (-not $values['DATABASE_URL'] -or -not $values['DATABASE_URL_SERVICE']) {
    throw 'missing-database-urls'
  }
  return $values
}

function Invoke-PreviewStep {
  param(
    [string]$Label,
    [string]$Directory,
    [scriptblock]$Command,
    [hashtable]$Environment = @{},
    [switch]$Foreground
  )
  $script:previewStep = $Label
  Write-Host $Label
  $info = New-Object System.Diagnostics.ProcessStartInfo
  $info.FileName = Join-Path $PSHOME 'powershell.exe'
  # The encoded command contains only static commands, never environment values.
  $commandText = '$ErrorActionPreference = ''Stop''; try { ' + $Command.ToString() + ' } catch { exit 1 }'
  $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($commandText))
  $info.Arguments = '-NoProfile -NonInteractive -EncodedCommand ' + $encoded
  $info.WorkingDirectory = $Directory
  $info.UseShellExecute = $false
  # All variables are assigned to the child environment, never this script's or the calling shell's.
  $info.EnvironmentVariables.Remove('DAWLYY_DEV_LOGIN')
  $info.EnvironmentVariables.Remove('DAWLYY_DEV_LOGIN_SECRET')
  foreach ($key in $Environment.Keys) {
    $info.EnvironmentVariables[$key] = $Environment[$key]
  }
  if (-not $Foreground) {
    # Setup tools can include connection details in errors. Only print a safe step failure below.
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
  }
  $process = New-Object System.Diagnostics.Process
  $process.StartInfo = $info
  try {
    if (-not $process.Start()) { throw 'preview-process-start-failed' }
    if (-not $Foreground) {
      # Drain both streams concurrently so a verbose migration cannot deadlock the child.
      $stdout = $process.StandardOutput.ReadToEndAsync()
      $stderr = $process.StandardError.ReadToEndAsync()
    }
    $process.WaitForExit()
    if (-not $Foreground) {
      $null = $stdout.GetAwaiter().GetResult()
      $null = $stderr.GetAwaiter().GetResult()
    }
    if ($process.ExitCode -ne 0) { throw 'preview-step-failed' }
  } finally {
    $process.Dispose()
  }
}

try {
  # Node and pnpm are already installed on this PC; do not install or download anything here.
  $null = Get-Command node -ErrorAction Stop
  $null = Get-Command pnpm -ErrorAction Stop
  $databaseEnvironment = Read-PreviewDatabaseEnvironment

  # Same fixed local cluster as tools/local_pg.ps1. Do not use its status action: it prints URLs.
  $clusterData = 'C:\Users\compuline\.pg0\instances\dawlyy-test\data'
  if (-not (Test-Path -LiteralPath (Join-Path $clusterData 'PG_VERSION') -PathType Leaf)) {
    Invoke-PreviewStep -Label 'بنجهّز قاعدة البيانات المحلية لأول مرة...' -Directory $previewRoot -Command {
      & '.\tools\local_pg.ps1' -Action init
      if (-not $?) { exit 1 }
      exit 0
    }
  }
  Invoke-PreviewStep -Label 'بنشغّل قاعدة البيانات المحلية...' -Directory $previewRoot -Command {
    & '.\tools\local_pg.ps1' -Action start
    if (-not $?) { exit 1 }
    exit 0
  }
  Invoke-PreviewStep -Label 'بنحدّث جداول قاعدة البيانات...' -Directory $previewRoot -Environment $databaseEnvironment -Command {
    & pnpm --filter '@dawlyy/db' migrate
    exit $LASTEXITCODE
  }
  Invoke-PreviewStep -Label 'بنجهّز صلاحيات الدخول المحلية...' -Directory $previewRoot -Command {
    & '.\tools\local_pg.ps1' -Action prepare
    if (-not $?) { exit 1 }
    exit 0
  }
  # seed/index.ts runs main() at import time, so run the two seed entrypoints in order.
  Invoke-PreviewStep -Label 'بنحمّل مكتبة التمارين والأكل...' -Directory $previewDbDirectory -Environment $databaseEnvironment -Command {
    & node --env-file=.env --import tsx ./seed/index.ts
    exit $LASTEXITCODE
  }
  Invoke-PreviewStep -Label 'بنجهّز حسابات التجربة...' -Directory $previewDbDirectory -Environment $databaseEnvironment -Command {
    & node --env-file=.env --import tsx ./seed/demo.ts
    exit $LASTEXITCODE
  }

  $previewStep = 'تجهيز مفتاح الدخول المؤقت'
  $randomBytes = New-Object byte[] 36
  $random = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try { $random.GetBytes($randomBytes) } finally { $random.Dispose() }
  # 36 random bytes encode as exactly 48 characters, with no padding.
  $serverEnvironment = @{} + $databaseEnvironment
  $serverEnvironment['DAWLYY_DEV_LOGIN'] = '1'
  $serverEnvironment['DAWLYY_DEV_LOGIN_SECRET'] = [Convert]::ToBase64String($randomBytes)
  $serverEnvironment['NODE_ENV'] = 'development'

  Write-Host 'افتح اللينك ده لما السيرفر يجهز: http://localhost:3200/ar/login'
  Write-Host 'علشان توقف التطبيق، اضغط Ctrl+C في الشباك ده.'
  Invoke-PreviewStep -Label 'بنشغّل معاينة DAWLYY...' -Directory $previewRoot -Environment $serverEnvironment -Foreground -Command {
    & pnpm --filter '@dawlyy/web' exec next dev --port 3200
    exit $LASTEXITCODE
  }
} catch {
  # Deliberately do not print $_, commands with values, or child setup logs.
  Write-Host ('المعاينة وقفت عند خطوة: ' + $previewStep) -ForegroundColor Red
  Write-Host 'راجع وجود Node وpnpm وملف packages/db/.env، وابعت اسم الخطوة لكلود علشان يراجعها.' -ForegroundColor Red
  exit 1
}
