# Converte as árvores e as pedras da pasta `lowpoly/` (FBX) em um .glb por peça.
#
#   blender --background --factory-startup --disable-autoexec --python converter.py -- <pasta lowpoly> <pasta de saída>
#
# São dois pacotes na mesma pasta:
#   - o de natureza (Tree_1..3, Rock_1..6: um FBX por peça, cor lisa no material, sem textura).
#     A árvore vem em pedaços (tronco + copas): viram UMA malha;
#   - o de pedras (`Rocks/rocks.fbx`: todas as peças num arquivo, em três tons, pintadas por um
#     atlas de cores). Daqui saem as pedras (`rockN.natural.*`) e os seixos (`pebblesN.caves.*`).
# O pé de cada peça vai para a origem (o meio da base no chão), de pé, em metros.
# No fim grava `medidas.json` (largura, altura e fundo de cada peça): o `trocar.mjs` usa as alturas.
import bpy, sys, os, json
from mathutils import Vector

ENTRADA, SAIDA = sys.argv[sys.argv.index('--') + 1:][:2]
os.makedirs(SAIDA, exist_ok=True)
TOM = 'light'                       # o tom do pacote de pedras (dark / medium / light): no campo claro, a clara
CINZA_MIN = 0.42                    # as pedras de cor lisa mais escuras que isto são clareadas até aqui
medidas = {}


def limpar():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def opaco(m):
    """O FBX do pacote de natureza traz a cor com transparência TOTAL (alfa 0): a peça sairia invisível."""
    m.use_backface_culling = True
    bsdf = next((n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None) if m.node_tree else None
    if not bsdf:
        return
    for lig in list(bsdf.inputs['Alpha'].links):
        m.node_tree.links.remove(lig)
    bsdf.inputs['Alpha'].default_value = 1
    bsdf.inputs['Roughness'].default_value = 1
    bsdf.inputs['Metallic'].default_value = 0


def gravar(nome, malhas, pe_no_tronco=False, clarear=False):
    """Junta as malhas, põe o pé na origem e grava `<nome>.glb`."""
    bpy.ops.object.select_all(action='DESELECT')
    for o in malhas:
        o.hide_set(False)
        o.select_set(True)
    bpy.context.view_layer.objects.active = malhas[0]
    if len(malhas) > 1:
        bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active
    # solta do pai guardando o lugar, e passa giro/escala para os vértices
    mundo = o.matrix_world.copy()
    o.parent = None
    o.matrix_world = mundo
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    vs = [v.co for v in o.data.vertices]
    zmin = min(v.z for v in vs); zmax = max(v.z for v in vs)
    # a árvore se apoia no TRONCO (a copa é torta): o meio dos vértices mais baixos
    base = [v for v in vs if v.z <= zmin + (zmax - zmin) * 0.06] if pe_no_tronco else vs
    cx = (min(v.x for v in base) + max(v.x for v in base)) / 2
    cy = (min(v.y for v in base) + max(v.y for v in base)) / 2
    for v in o.data.vertices:
        v.co -= Vector((cx, cy, zmin))
    o.name = o.data.name = nome
    for m in o.data.materials:
        opaco(m)
        bsdf = next((n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        cor = bsdf.inputs['Base Color'] if bsdf else None
        if clarear and cor and not cor.links and max(cor.default_value[:3]) < CINZA_MIN:
            k = CINZA_MIN / max(cor.default_value[:3])
            cor.default_value = [c * k for c in cor.default_value[:3]] + [1]
    d = o.dimensions
    medidas[nome] = [round(d.x, 3), round(d.z, 3), round(d.y, 3)]     # largura, ALTURA, fundo
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=os.path.join(SAIDA, nome + '.glb'), export_format='GLB', use_selection=True,
                              export_yup=True, export_apply=True, export_animations=False, export_image_format='AUTO')
    print('PECA', nome, medidas[nome], 'triângulos', sum(len(p.vertices) - 2 for p in o.data.polygons))


# o pacote de natureza: um FBX por peça
for n in (1, 2, 3):
    limpar()
    bpy.ops.import_scene.fbx(filepath=os.path.join(ENTRADA, f'Tree_{n}.fbx'))
    gravar(f'lp-Tree_{n}', [o for o in bpy.data.objects if o.type == 'MESH'], pe_no_tronco=True)
for n in range(1, 7):
    limpar()
    bpy.ops.import_scene.fbx(filepath=os.path.join(ENTRADA, f'Rock_{n}.fbx'))
    gravar(f'lp-Rock_{n}', [o for o in bpy.data.objects if o.type == 'MESH'], clarear=True)

# o pacote de pedras: tudo num arquivo
limpar()
bpy.ops.import_scene.fbx(filepath=os.path.join(ENTRADA, 'Rocks', 'rocks.fbx'))
for n in range(1, 11):
    gravar(f'lp-Rock_N{n}', [bpy.data.objects[f'rock{n}.natural.{TOM}']])
for n in range(1, 5):
    gravar(f'lp-Rock_Seixos_{n}', [bpy.data.objects[f'pebbles{n}.caves.{TOM}']])

with open(os.path.join(SAIDA, 'medidas.json'), 'w', encoding='utf-8') as f:
    json.dump(medidas, f, indent=1)
