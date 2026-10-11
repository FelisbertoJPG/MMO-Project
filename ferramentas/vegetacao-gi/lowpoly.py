# Passa o "filtro low poly" nas plantas de um .blend e grava um .glb por peça.
#
#   blender --background --factory-startup --disable-autoexec <arquivo.blend> --python lowpoly.py -- <pasta de saída>
#
# O que o filtro faz, peça a peça:
#   - malha: as partes "de corpo" (caule, fruto, miolo) perdem metade ou mais dos triângulos; as CARTAS
#     (folhas e pétalas de um quadrado só, recortadas pela transparência da textura) ficam inteiras —
#     tirar um triângulo de uma carta corta o desenho ao meio;
#   - sombreado: faces planas (sem normais suavizadas), como as peças low poly do resto do jogo;
#   - textura: metade do tamanho, cor achatada (média de blocos + poucos tons por canal) e a
#     transparência virando recorte duro (0 ou 1), sem mapa de normal, brilho ou emissão;
#   - o pé da peça vai para a origem (meio da base no chão), em metros, de pé.
# No fim grava duas pranchas (antes.png / depois.png) com todas as peças, na mesma ordem.
import bpy, bmesh, sys, os, re, json, math
import numpy as np
from mathutils import Matrix, Vector

SAIDA = sys.argv[sys.argv.index('--') + 1]
os.makedirs(SAIDA, exist_ok=True)
TEX = os.path.join(SAIDA, 'texturas')
os.makedirs(TEX, exist_ok=True)

FORA = {'Cube', 'Ground'}          # o cubo padrão e o chão da cena de demonstração
TONS = 10                           # tons por canal depois de achatar a cor
CARTA_MAX = 4                       # ilha com até 4 triângulos = carta (não se mexe)

cena = bpy.context.scene
col = cena.collection


# ---------- nomes ----------
def nome_limpo(n):
    n = re.sub(r'\.\d{3}$', '', n.strip())
    n = n.replace('Flawer', 'Flower').replace('Grass Emitter', 'Grass_Card').replace('Wheat Emitter', 'Wheat_Card')
    for p in ('Area_Common_Prop_', 'Area_Common_', 'Area_Ly_', 'Area_MdProps_', 'Item_Plant_',
              'Property_Ani_Flower_', 'Property_Ani_'):
        if n.startswith(p):
            n = n[len(p):]
    n = re.sub(r'_(Vo|Lod\d|LOD\d)$', '', n)
    return 'gi-' + re.sub(r'\s+', '_', n)


# ---------- textura ----------
feitas = {}

def gravar_png(arq, px):
    """Grava `px` (alto × largo × 4, de 0 a 1, linhas de BAIXO para cima como no Blender) num PNG RGBA de 8 bits."""
    import zlib, struct
    b = (np.clip(px[::-1], 0, 1) * 255 + 0.5).astype(np.uint8)
    h, w = b.shape[:2]
    linhas = np.concatenate([np.zeros((h, 1), dtype=np.uint8), b.reshape(h, w * 4)], axis=1).tobytes()
    def bloco(tipo, dados):
        return struct.pack('>I', len(dados)) + tipo + dados + struct.pack('>I', zlib.crc32(tipo + dados) & 0xffffffff)
    with open(arq, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n' + bloco(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0))
                + bloco(b'IDAT', zlib.compress(linhas, 9)) + bloco(b'IEND', b''))

def textura_filtrada(img):
    if img.name in feitas:
        return feitas[img.name]
    w, h = img.size
    a = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(a)
    a = a.reshape(h, w, 4)
    f = 4 if max(w, h) > 1024 else 2          # tamanho final: metade (um quarto nas de 2048)
    g = f                                      # a cor sai dos mesmos blocos (o dobro quadriculava as flores)
    def blocos(m, k):
        return m.reshape(h // k, k, w // k, k, m.shape[2]).sum(axis=(1, 3))
    alfa = a[:, :, 3:4]
    # cor: média pesada pela transparência (não escurece a borda), em blocos grandes
    soma = blocos(a[:, :, :3] * alfa, g)
    peso = blocos(alfa, g)
    geral = (a[:, :, :3] * alfa).sum(axis=(0, 1)) / max(float(alfa.sum()), 1e-6)
    tem = peso[:, :, 0] > 1e-4
    cor = np.where(tem[:, :, None], soma / np.maximum(peso, 1e-6), 0.0)
    # a cor SANGRA para dentro do transparente (16 passadas: cada texel vazio pega a média dos
    # vizinhos que já têm cor). Sem isso o texel recortado fica preto, e de longe (mipmaps) um
    # caule de 1–2 texels de largura se mistura com ele: o trigo e o junco saíam pretos no jogo.
    for _ in range(16):
        if tem.all():
            break
        s = np.zeros_like(cor); n = np.zeros(tem.shape, dtype=np.float32)
        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            s += np.roll(cor * tem[:, :, None], (dy, dx), axis=(0, 1)); n += np.roll(tem, (dy, dx), axis=(0, 1))
        novo = ~tem & (n > 0)
        cor[novo] = s[novo] / n[novo][:, None]
        tem = tem | novo
    cor[~tem] = geral
    cor = np.round(cor * TONS) / TONS
    # recorte: a transparência na resolução final, dura
    corte = (blocos(alfa, f) / (f * f) > 0.5).astype(np.float32)
    fim = np.concatenate([np.clip(cor, 0, 1), corte], axis=2).astype(np.float32)
    nw, nh = w // f, h // f
    nome = re.sub(r'[^A-Za-z0-9_]+', '_', re.sub(r'\.png.*$', '', img.name)).strip('_')
    # o PNG é escrito AQUI, e não pelo Blender: ao salvar, ele zera a cor de todo texel
    # transparente (e lá se ia a cor sangrada). O exportador de glTF copia o arquivo como está.
    arq = os.path.join(TEX, nome + '.png')
    gravar_png(arq, fim)
    nova = bpy.data.images.load(arq)
    nova.name = 'lp_' + nome
    feitas[img.name] = (nova, bool((corte < 0.5).any()))
    return feitas[img.name]


def imagem_da_cor(mat):
    if not mat or not mat.node_tree:
        return None
    for n in mat.node_tree.nodes:
        if n.type == 'TEX_IMAGE' and n.image:
            for s in n.outputs:
                for l in s.links:
                    if l.to_socket.name == 'Base Color':
                        return n.image
    return None


materiais = {}

def material_filtrado(mat):
    if mat.name in materiais:
        return materiais[mat.name]
    img = imagem_da_cor(mat)
    novo = bpy.data.materials.new('lp_' + mat.name[:50])
    if not novo.node_tree:
        novo.use_nodes = True
    nt = novo.node_tree
    nt.nodes.clear()
    sai = nt.nodes.new('ShaderNodeOutputMaterial')
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    bsdf.inputs['Roughness'].default_value = 1.0
    bsdf.inputs['Metallic'].default_value = 0.0
    nt.links.new(bsdf.outputs['BSDF'], sai.inputs['Surface'])
    recorte = False
    if img:
        nova, recorte = textura_filtrada(img)
        tex = nt.nodes.new('ShaderNodeTexImage')
        tex.image = nova
        nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
        if recorte:
            arred = nt.nodes.new('ShaderNodeMath')
            arred.operation = 'ROUND'
            nt.links.new(tex.outputs['Alpha'], arred.inputs[0])
            nt.links.new(arred.outputs[0], bsdf.inputs['Alpha'])
    novo.use_backface_culling = False
    materiais[mat.name] = novo
    return novo


# ---------- malha ----------
def tris_de(me):
    me.calc_loop_triangles()
    return len(me.loop_triangles)


def ilhas(bm):
    """Separa as faces em ilhas ligadas (por vértice) e devolve [(faces, triângulos)]."""
    visto, saida = set(), []
    for f0 in bm.faces:
        if f0.index in visto:
            continue
        pilha, faces, t = [f0], [], 0
        visto.add(f0.index)
        while pilha:
            f = pilha.pop()
            faces.append(f)
            t += len(f.verts) - 2
            for v in f.verts:
                for g in v.link_faces:
                    if g.index not in visto:
                        visto.add(g.index)
                        pilha.append(g)
        saida.append((faces, t))
    return saida


def reduzir(obj):
    """Devolve (antes, depois, cartas): reduz só as ilhas que não são cartas."""
    me = obj.data
    antes = tris_de(me)
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.faces.ensure_lookup_table()
    bm.faces.index_update()
    grupos = ilhas(bm)
    cartas = {f.index for faces, t in grupos if t <= CARTA_MAX for f in faces}
    t_corpo = sum(t for _, t in grupos if t > CARTA_MAX)
    t_cartas = antes - t_corpo
    if t_corpo <= 150:
        bm.free()
        return antes, antes, t_cartas
    razao = 0.5 if t_corpo <= 800 else 0.4
    # corpo e cartas em malhas separadas
    bc = bm.copy()
    bc.faces.ensure_lookup_table()
    bmesh.ops.delete(bc, geom=[f for f in bc.faces if f.index in cartas], context='FACES')
    bk = bm.copy()
    bk.faces.ensure_lookup_table()
    bmesh.ops.delete(bk, geom=[f for f in bk.faces if f.index not in cartas], context='FACES')
    bm.free()
    m_corpo = me.copy(); bc.to_mesh(m_corpo); bc.free()
    m_cartas = me.copy(); bk.to_mesh(m_cartas); bk.free()
    tmp = bpy.data.objects.new('tmp_corpo', m_corpo)
    col.objects.link(tmp)
    mod = tmp.modifiers.new('reduz', 'DECIMATE')
    mod.ratio = razao
    mod.use_collapse_triangulate = True
    dg = bpy.context.evaluated_depsgraph_get()
    m_red = bpy.data.meshes.new_from_object(tmp.evaluated_get(dg))
    junto = bmesh.new()
    junto.from_mesh(m_red)
    junto.from_mesh(m_cartas)
    junto.to_mesh(me)
    junto.free()
    bpy.data.objects.remove(tmp)
    return antes, tris_de(me), t_cartas


def caixa(obj):
    pts = [obj.matrix_world @ v.co for v in obj.data.vertices]
    mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return mn, mx


def assentar(obj):
    """Aplica a transformação, põe de pé a carta deitada e leva o meio da base para a origem."""
    me = obj.data
    me.transform(obj.matrix_world)
    obj.matrix_world = Matrix.Identity(4)
    mn, mx = caixa(obj)
    if mx.z - mn.z < 0.02 and mx.y - mn.y > 0.1:         # carta deitada no chão: o Y vira a altura
        me.transform(Matrix.Rotation(math.pi / 2, 4, 'X'))
        mn, mx = caixa(obj)
    me.transform(Matrix.Translation((-(mn.x + mx.x) / 2, -(mn.y + mx.y) / 2, -mn.z)))
    me.update()


def faces_planas(me):
    for nome in ('custom_normal',):
        if nome in me.attributes:
            me.attributes.remove(me.attributes[nome])
    for p in me.polygons:
        p.use_smooth = False
    me.update()


# ---------- a passada ----------
originais = [o for o in sorted(bpy.data.objects, key=lambda o: o.name) if o.type == 'MESH' and o.name not in FORA]
pares, relatorio, usados = [], [], set()
for o in originais:
    nome = nome_limpo(o.name)
    while nome in usados:
        nome += '_b'
    usados.add(nome)
    p = o.copy()
    p.data = o.data.copy()
    p.name = nome
    col.objects.link(p)
    while p.modifiers:
        p.modifiers.remove(p.modifiers[0])
    assentar(p)
    antes, depois, cartas = reduzir(p)
    faces_planas(p.data)
    for vaga in p.material_slots:
        if vaga.material:
            vaga.material = material_filtrado(vaga.material)
    mn, mx = caixa(p)
    for x in bpy.context.view_layer.objects:
        x.select_set(False)
    p.select_set(True)
    bpy.context.view_layer.objects.active = p
    arq = os.path.join(SAIDA, nome + '.glb')
    bpy.ops.export_scene.gltf(filepath=arq, export_format='GLB', use_selection=True, export_apply=True,
                              export_yup=True, export_animations=False, export_tangents=False,
                              export_cameras=False, export_lights=False)
    relatorio.append({'nome': nome, 'de': o.name, 'antes': antes, 'depois': depois, 'cartas': cartas,
                      'tamanho': [round(mx.x - mn.x, 2), round(mx.z - mn.z, 2), round(mx.y - mn.y, 2)],
                      'kb': round(os.path.getsize(arq) / 1024)})
    pares.append((o, p))

# as texturas de terreno (só a cor), filtradas do mesmo jeito, para referência
for img in bpy.data.images:
    if re.match(r'Stages_Mdterrain.*Diffuse', img.name) and img.size[0]:
        textura_filtrada(img)

json.dump(relatorio, open(os.path.join(SAIDA, 'relatorio.json'), 'w', encoding='utf-8'), indent=1, ensure_ascii=False)


# ---------- as pranchas ----------
COLUNAS, PASSO = 10, 1.5

def na_grade(obj, i):
    mn, mx = caixa(obj)
    lado = max(mx.x - mn.x, mx.y - mn.y, mx.z - mn.z, 1e-3)
    pe = Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z))
    lugar = Vector(((i % COLUNAS) * PASSO, 0, -(i // COLUNAS) * PASSO))
    obj.matrix_world = Matrix.Translation(lugar) @ Matrix.Diagonal((1.2 / lado,) * 3).to_4x4() @ Matrix.Translation(-pe) @ obj.matrix_world

for i, (o, p) in enumerate(pares):
    na_grade(o, i)
    na_grade(p, i)

linhas = math.ceil(len(pares) / COLUNAS)
cam_d = bpy.data.cameras.new('prancha')
cam_d.type = 'ORTHO'
cam_d.ortho_scale = COLUNAS * PASSO + 0.4
cam = bpy.data.objects.new('prancha', cam_d)
col.objects.link(cam)
cam.location = ((COLUNAS - 1) * PASSO / 2, -30, -(linhas - 1) * PASSO / 2 + 0.6)
cam.rotation_euler = (math.radians(90), 0, 0)
cena.camera = cam
cena.render.engine = 'BLENDER_WORKBENCH'
cena.display.shading.light = 'STUDIO'
cena.display.shading.color_type = 'TEXTURE'
cena.render.resolution_x = 2400
cena.render.resolution_y = int(2400 * (linhas * PASSO + 0.4) / (COLUNAS * PASSO + 0.4))
cena.render.film_transparent = False
if cena.world:
    cena.world.color = (0.16, 0.18, 0.2)
cena.render.image_settings.file_format = 'PNG'

todos = {x for par in pares for x in par}
for x in bpy.data.objects:
    if x not in todos and x is not cam:
        x.hide_render = True
for qual, k in (('antes', 0), ('depois', 1)):
    for par in pares:
        par[0].hide_render = k == 1
        par[1].hide_render = k == 0
    cena.render.filepath = os.path.join(SAIDA, qual + '.png')
    bpy.ops.render.render(write_still=True)

print('PRONTO', len(relatorio), 'peças;', sum(r['antes'] for r in relatorio), '->', sum(r['depois'] for r in relatorio), 'triângulos')
for i, r in enumerate(relatorio):
    print(f"PECA|{i}|{r['nome']}|{r['antes']}->{r['depois']}|cartas={r['cartas']}|{r['tamanho']}|{r['kb']}KB")
