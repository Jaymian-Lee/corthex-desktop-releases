$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $env:RUNNER_TEMP 'corthex-installer-acceptance'))
$target = [IO.Path]::GetFullPath((Join-Path $root 'app'))
if (-not $target.StartsWith($root + '\',[StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe isolated installer target.' }
$installed = Get-ChildItem 'HKCU:/Software/Microsoft/Windows/CurrentVersion/Uninstall' -ErrorAction SilentlyContinue | ForEach-Object { Get-ItemProperty -LiteralPath $_.PSPath } | Where-Object DisplayName -Match '^Corthex(?:\s|$)'
if ($installed -or (Get-Process Corthex -ErrorAction SilentlyContinue)) { throw 'The test runner must have no existing Corthex installation.' }
$installer = Join-Path $root 'installer.exe'
if ((Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash.ToLowerInvariant() -ne $env:QA_SHA256) { throw 'Installer changed before installation.' }
$setup = Start-Process -FilePath $installer -ArgumentList @('/S','--currentuser','--no-desktop-shortcut',"/D=$target") -WindowStyle Hidden -Wait -PassThru
if ($setup.ExitCode -ne 0) { throw 'Isolated installation failed.' }
$testExit = 1
try {
  node qa/installed.mjs
  $testExit = $LASTEXITCODE
} finally {
  if ((Resolve-Path -LiteralPath $target).Path -ne $target -or -not $target.StartsWith($root + '\',[StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe uninstall target.' }
  $cleanup = Start-Process -FilePath (Join-Path $target 'Uninstall Corthex.exe') -ArgumentList @('/S',"_?=$target") -WindowStyle Hidden -Wait -PassThru
  if ($cleanup.ExitCode -ne 0 -or (Test-Path -LiteralPath (Join-Path $target 'Corthex.exe'))) { throw 'Isolated uninstall failed.' }
}
if ($testExit -ne 0) { throw 'Installed application acceptance failed.' }
$receiptPath = Join-Path $root 'installed-acceptance.json'
$receipt = Get-Content -LiteralPath $receiptPath -Raw | ConvertFrom-Json
$receipt | Add-Member -NotePropertyName uninstallVerified -NotePropertyValue $true
$receipt | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $receiptPath

