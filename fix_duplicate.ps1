$f = 'e:\AI Joko\lebihfit tools\index.html'
$lines = [System.IO.File]::ReadAllLines($f)
# Keep lines 0-632 (index) and 1358 onwards (index) = skip the duplicate LP baris 634-1358
$keep = $lines[0..632] + $lines[1358..($lines.Length - 1)]
[System.IO.File]::WriteAllLines($f, $keep, [System.Text.UTF8Encoding]::new($false))
Write-Host "Done. Total lines now: $($keep.Length)"
