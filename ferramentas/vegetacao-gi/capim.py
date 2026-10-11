# As CARTAS DE CAPIM `gi` (assets/capim-gi.png) — as folhas de capim do atlas do pacote
# (`Stages_MGrass01_Diffuse`), recompostas em 4 cartas de 256 px para o capim do jogo (capim.js):
# várias folhas por carta, o pé na borda de baixo, CLARAS e sem cor (o jogo tinge cada tufo com a
# cor do chão embaixo dele, como faz com as cartas desenhadas em código).
#
#   blender --background --factory-startup --disable-autoexec <arquivo.blend> --python capim.py -- assets/capim-gi.png
#
# Na imagem: em cima as cartas 6 e 7, embaixo a 4 e a 5 (a conta do atlas em campo.js).
import bpy, sys, zlib, struct
import numpy as np

SAIDA = sys.argv[sys.argv.index('--') + 1]
L = 256
# onde está cada folha no atlas de 1024 px (x0, x1, y0, y1; y de cima para baixo)
FOLHAS = {
    'curva': (20, 148, 588, 776), 'curvinha': (164, 240, 604, 764),
    'alta1': (112, 168, 784, 1012), 'alta2': (44, 108, 808, 1016),
    'larga': (256, 352, 828, 1020), 'par': (404, 476, 828, 1020), 'baixa': (320, 368, 908, 1020),
}
# cada carta: (folhas que entram, quantas, altura mínima e máxima em fração da carta, abertura)
CARTAS = [
    (('alta1', 'alta2', 'par', 'larga'), 9, 0.62, 0.98, 0.8),      # 4: o capim alto
    (('curva', 'curvinha', 'alta2'), 9, 0.5, 0.9, 0.95),           # 5: o fino e curvado
    (('baixa', 'curvinha', 'larga', 'par'), 11, 0.3, 0.6, 1.0),    # 6: o rasteiro
    (('alta1', 'curva', 'par', 'larga', 'alta2'), 12, 0.45, 0.95, 1.0),   # 7: o cheio
]

img = bpy.data.images['Stages_MGrass01_Diffuse.png']
w, h = img.size
a = np.empty(w * h * 4, dtype=np.float32)
img.pixels.foreach_get(a)
a = a.reshape(h, w, 4)[::-1]

semente = 20261011
def rnd():
    global semente
    semente = (semente * 1664525 + 1013904223) & 0xffffffff
    return semente / 4294967296

def folha(nome):
    x0, x1, y0, y1 = FOLHAS[nome]
    c = a[y0:y1, x0:x1]
    alfa = c[:, :, 3]
    lum = c[:, :, :3].max(axis=2)
    dentro = alfa > 0.5
    lo, hi = np.percentile(lum[dentro], 5), np.percentile(lum[dentro], 95)
    # claro e sem cor: o desenho da folha (a sombra, a nervura) fica entre 0,66 e 1
    v = 0.66 + 0.34 * np.clip((lum - lo) / max(hi - lo, 1e-4), 0, 1)
    return v, alfa

def carta(nomes, quantas, amin, amax, abre):
    cor = np.full((L, L), 0.9, dtype=np.float32)
    alfa = np.zeros((L, L), dtype=np.float32)
    # as de trás primeiro (mais escuras), as da frente por cima
    for i in range(quantas):
        v, al = folha(nomes[int(rnd() * len(nomes))])
        fh, fw = v.shape
        alt = int(L * (amin + rnd() * (amax - amin)))
        larg = max(6, int(fw * alt / fh))
        ys = (np.arange(alt) * fh / alt).astype(int)
        xs = (np.arange(larg) * fw / larg).astype(int)
        if rnd() < 0.5:
            xs = xs[::-1]
        v2, al2 = v[ys][:, xs], al[ys][:, xs]
        meio = L / 2 + (rnd() - 0.5) * 2 * (L * 0.36 * abre)
        x0 = int(np.clip(meio - larg / 2, 0, L - larg)); y0 = L - alt
        fundo = 0.86 + 0.14 * (i / max(quantas - 1, 1))
        m = al2 > 0.5
        cor[y0:, x0:x0 + larg][m] = (v2 * fundo)[m]
        alfa[y0:, x0:x0 + larg][m] = 1.0
    # o pé um pouco mais escuro (a sombra de contato)
    cor *= (0.86 + 0.14 * np.linspace(1, 0, L) ** 0.6)[:, None]
    return np.dstack([cor, cor, cor * 0.96, alfa])

c4, c5, c6, c7 = [carta(*c) for c in CARTAS]
px = np.vstack([np.hstack([c6, c7]), np.hstack([c4, c5])])       # de cima para baixo

b = (np.clip(px, 0, 1) * 255 + 0.5).astype(np.uint8)
H, W = b.shape[:2]
linhas = np.concatenate([np.zeros((H, 1), dtype=np.uint8), b.reshape(H, W * 4)], axis=1).tobytes()
def bloco(tipo, dados):
    return struct.pack('>I', len(dados)) + tipo + dados + struct.pack('>I', zlib.crc32(tipo + dados) & 0xffffffff)
with open(SAIDA, 'wb') as f:
    f.write(b'\x89PNG\r\n\x1a\n' + bloco(b'IHDR', struct.pack('>IIBBBBB', W, H, 8, 6, 0, 0, 0))
            + bloco(b'IDAT', zlib.compress(linhas, 9)) + bloco(b'IEND', b''))
print('PRONTO', SAIDA, W, H)
