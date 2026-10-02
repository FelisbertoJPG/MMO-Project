# Desenha o icone do masmorra.exe (launcher/icone.ico): uma espada sobre uma
# brasa, num quadrado escuro. O desenho E este codigo — mude aqui e rode:
#   powershell -ExecutionPolicy Bypass -File launcher\gerar-icone.ps1
# O .ico leva PNGs em 256/48/32/16 px: cada tamanho e' DESENHADO no seu tamanho,
# e nao reduzido do grande — reduzido, a lamina de 1 px some no de 16.
Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = 'Stop'

function Desenhar([int]$t) {
  $bmp = New-Object Drawing.Bitmap $t, $t, ([Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $k = $t / 256.0
  $R = { param($x, $y, $w, $h) New-Object Drawing.RectangleF ($x * $k), ($y * $k), ($w * $k), ($h * $k) }

  # fundo: quadrado arredondado quase preto
  $raio = 48 * $k
  $caminho = New-Object Drawing.Drawing2D.GraphicsPath
  $caminho.AddArc(0, 0, $raio, $raio, 180, 90)
  $caminho.AddArc($t - $raio - 1, 0, $raio, $raio, 270, 90)
  $caminho.AddArc($t - $raio - 1, $t - $raio - 1, $raio, $raio, 0, 90)
  $caminho.AddArc(0, $t - $raio - 1, $raio, $raio, 90, 90)
  $caminho.CloseFigure()
  $g.FillPath((New-Object Drawing.SolidBrush ([Drawing.Color]::FromArgb(255, 22, 18, 26))), $caminho)

  # brasa: brilho radial laranja embaixo
  $brilho = New-Object Drawing.Drawing2D.GraphicsPath
  $brilho.AddEllipse((& $R 28 96 200 200))
  $pb = New-Object Drawing.Drawing2D.PathGradientBrush $brilho
  $pb.CenterColor = [Drawing.Color]::FromArgb(255, 255, 140, 40)
  $pb.SurroundColors = @([Drawing.Color]::FromArgb(0, 120, 30, 0))
  $g.SetClip($caminho)
  $g.FillPath($pb, $brilho)
  $g.ResetClip()

  # espada, ponta para cima
  $aco = New-Object Drawing.SolidBrush ([Drawing.Color]::FromArgb(255, 214, 220, 228))
  $sombra = New-Object Drawing.SolidBrush ([Drawing.Color]::FromArgb(255, 150, 158, 170))
  $ouro = New-Object Drawing.SolidBrush ([Drawing.Color]::FromArgb(255, 232, 178, 64))
  $cabo = New-Object Drawing.SolidBrush ([Drawing.Color]::FromArgb(255, 110, 62, 36))
  $P = { param($x, $y) New-Object Drawing.PointF ($x * $k), ($y * $k) }
  $g.FillPolygon($aco, [Drawing.PointF[]]@((& $P 128 22), (& $P 146 52), (& $P 146 168), (& $P 110 168), (& $P 110 52)))
  $g.FillPolygon($sombra, [Drawing.PointF[]]@((& $P 128 22), (& $P 146 52), (& $P 146 168), (& $P 128 168)))
  $g.FillRectangle($ouro, (& $R 72 164 112 20))
  $g.FillRectangle($cabo, (& $R 118 184 20 44))
  $g.FillEllipse($ouro, (& $R 112 222 32 24))
  $g.Dispose()

  $ms = New-Object IO.MemoryStream
  $bmp.Save($ms, [Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  return ,$ms.ToArray()
}

$tamanhos = 256, 48, 32, 16
$pngs = foreach ($t in $tamanhos) { ,(Desenhar $t) }

# ICO: cabecalho (6) + uma entrada de 16 bytes por imagem + os PNGs
$saida = New-Object IO.MemoryStream
$w = New-Object IO.BinaryWriter $saida
$w.Write([UInt16]0); $w.Write([UInt16]1); $w.Write([UInt16]$tamanhos.Count)
$deslocamento = 6 + 16 * $tamanhos.Count
for ($i = 0; $i -lt $tamanhos.Count; $i++) {
  $t = $tamanhos[$i]; $d = $pngs[$i]
  $w.Write([byte]($t % 256)); $w.Write([byte]($t % 256))   # 256 vira 0, como o formato pede
  $w.Write([byte]0); $w.Write([byte]0)
  $w.Write([UInt16]1); $w.Write([UInt16]32)
  $w.Write([UInt32]$d.Length); $w.Write([UInt32]$deslocamento)
  $deslocamento += $d.Length
}
foreach ($d in $pngs) { $w.Write($d) }
$w.Flush()
$destino = Join-Path $PSScriptRoot 'icone.ico'
[IO.File]::WriteAllBytes($destino, $saida.ToArray())
[IO.File]::WriteAllBytes((Join-Path $PSScriptRoot 'icone.png'), $pngs[0])
"OK  $destino ($($saida.Length) bytes)"
