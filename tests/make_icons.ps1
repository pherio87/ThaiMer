# Genera le icone della PWA da assets/logo.jpg (quadrata). Uso: powershell -File tests/make_icons.ps1
Add-Type -AssemblyName System.Drawing
$root = Split-Path $PSScriptRoot
$src = [System.Drawing.Image]::FromFile((Join-Path $root 'assets\logo.jpg'))
$out = Join-Path $root 'public\icons'

# safe = frazione del lato occupata dal logo (le icone maskable richiedono margine)
function Save-Icon($name, $size, $safe) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = 'HighQualityBicubic'
  $g.SmoothingMode = 'HighQuality'
  $g.PixelOffsetMode = 'HighQuality'
  $g.Clear([System.Drawing.Color]::Black)
  $side = $size * $safe
  $g.DrawImage($src, ($size - $side) / 2, ($size - $side) / 2, $side, $side)
  $g.Dispose()
  $bmp.Save((Join-Path $out $name), [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}
Save-Icon 'icon-192.png' 192 1.0
Save-Icon 'icon-512.png' 512 1.0
Save-Icon 'icon-maskable-512.png' 512 0.78
Save-Icon 'apple-touch-icon.png' 180 1.0
$src.Dispose()
Write-Output 'ok'
