# O FILTRO LOW POLY DAS ÁRVORES (11/10/2026) — passa as árvores detalhadas da Quaternius
# (`estilizada-*Tree*`, `megakit-CommonTree_1`: tronco de ~5 mil triângulos com textura e copa de
# CARTAS de folha recortadas pela transparência) para o jeito das `lp-` das WindHills: facetas
# planas, cor lisa, copa em BLOCOS.
#
#   blender --background --factory-startup --disable-autoexec --python arvores.py -- <pasta dos .glb> <pasta de saída>
#
# O que o filtro faz, árvore a árvore:
#   - tronco: perde ~88% dos triângulos, fica de faces planas e na cor MÉDIA da textura da casca;
#   - copa: as cartas de folha são agrupadas em tufos (k-médias sobre os vértices) e cada tufo vira
#     um bloco facetado (a casca convexa dele, reduzida a poucas dezenas de triângulos e um pouco
#     encolhida), na cor média das folhas — os de cima mais claros, os de baixo mais escuros;
#   - sem textura nem transparência: a cor vai nos VÉRTICES, num material só (uma chamada de desenho).
# O lugar da origem e o tamanho não mudam: o decor.json continua valendo como está.
# Os originais só existem no histórico do git (ou no editor de cenas, de onde vieram).
import bpy, bmesh, sys, os, glob
import numpy as np
from mathutils import Vector

ENTRADA, SAIDA = sys.argv[sys.argv.index('--') + 1:][:2]
os.makedirs(SAIDA, exist_ok=True)
ARVORES = ['estilizada-NormalTree_1', 'estilizada-NormalTree_2', 'estilizada-NormalTree_3', 'estilizada-NormalTree_4',
           'estilizada-NormalTree_5', 'estilizada-BirchTree_2', 'estilizada-MapleTree_2', 'megakit-CommonTree_1',
           'estilizada-DeadTree_1', 'estilizada-DeadTree_2', 'estilizada-DeadTree_3']
TRONCO = 0.12          # a fração dos triângulos do tronco que fica
BLOCO_TRIS = 44        # triângulos de cada bloco da copa
ENCOLHE = 0.9          # a casca convexa passa das folhas (as pontas das cartas): o bloco encolhe


def linear(c):
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def cor_media(mat):
    """A cor média (linear) da textura do material, pesada pela transparência."""
    img = next((n.image for n in mat.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image), None)
    if not img:
        return np.array(mat.diffuse_color[:3])
    a = np.empty(img.size[0] * img.size[1] * 4, dtype=np.float32)
    img.pixels.foreach_get(a)
    a = a.reshape(-1, 4)
    peso = a[:, 3:4]
    return (linear(a[:, :3]) * peso).sum(axis=0) / max(float(peso.sum()), 1e-6)


def e_folha(mat):
    b = next((n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    return 'lea' in mat.name.lower() or (b is not None and bool(b.inputs['Alpha'].links) and 'bark' not in mat.name.lower())


def tufos(pontos, k):
    """k-médias, com a partida nos pontos mais afastados entre si (sempre o mesmo resultado)."""
    centros = [pontos[np.argmax(pontos[:, 2])]]
    for _ in range(k - 1):
        d = np.min([((pontos - c) ** 2).sum(axis=1) for c in centros], axis=0)
        centros.append(pontos[np.argmax(d)])
    centros = np.array(centros)
    for _ in range(25):
        de = np.argmin(((pontos[:, None, :] - centros[None, :, :]) ** 2).sum(axis=2), axis=1)
        novos = np.array([pontos[de == i].mean(axis=0) if (de == i).any() else centros[i] for i in range(k)])
        if np.allclose(novos, centros, atol=1e-4):
            break
        centros = novos
    return de


def malha_reduzida(nome, bm, tris):
    """A malha do `bm` reduzida a ~`tris` triângulos (o `bm` é liberado)."""
    me = bpy.data.meshes.new(nome)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(nome, me)
    bpy.context.scene.collection.objects.link(o)
    mod = o.modifiers.new('reduz', 'DECIMATE')
    mod.ratio = min(1.0, tris / max(len(me.polygons), 1))
    fim = bpy.data.meshes.new_from_object(o.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    bpy.data.objects.remove(o)
    return fim


def filtrar(nome):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.join(ENTRADA, nome + '.glb'))
    malhas = [o for o in bpy.data.objects if o.type == 'MESH']
    if len(malhas) != 1:
        raise RuntimeError(f'{nome}: esperava uma malha, vieram {len(malhas)}')
    orig = malhas[0]
    me = orig.data
    antes = sum(len(p.vertices) - 2 for p in me.polygons)
    folha = [e_folha(m) for m in me.materials]
    cores = [cor_media(m) for m in me.materials]
    # a megakit pinta pela cor dos VÉRTICES (a textura é só o claro-escuro, quase branca): entra na média
    if me.color_attributes:
        at = me.color_attributes[0]
        v = np.empty(len(at.data) * 4, dtype=np.float32)
        at.data.foreach_get('color', v)
        v = v.reshape(-1, 4)[:, :3]
        for i in range(len(cores)):
            if at.domain == 'CORNER':
                quais = [l for p in me.polygons if p.material_index == i for l in p.loop_indices]
            else:
                quais = list({q for p in me.polygons if p.material_index == i for q in p.vertices})
            if quais:
                cores[i] = cores[i] * v[quais].mean(axis=0)
    partes = []                                              # (malha, cor)

    # o tronco
    bm = bmesh.new(); bm.from_mesh(me)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if folha[f.material_index]], context='FACES')
    n_tronco = sum(len(f.verts) - 2 for f in bm.faces)
    cor_tronco = np.mean([c for c, f in zip(cores, folha) if not f], axis=0)
    partes.append((malha_reduzida('tronco', bm, n_tronco * TRONCO), cor_tronco))

    # a copa
    if any(folha):
        bm = bmesh.new(); bm.from_mesh(me)
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if not folha[f.material_index]], context='FACES')
        pts = np.array([v.co[:] for v in bm.verts if v.link_faces], dtype=np.float64)
        n_folha = sum(len(f.verts) - 2 for f in bm.faces)
        bm.free()
        cor_folha = np.mean([c for c, f in zip(cores, folha) if f], axis=0)
        k = int(min(9, max(4, round(3 + n_folha / 600))))
        de = tufos(pts, k)
        z0, z1 = pts[:, 2].min(), pts[:, 2].max()
        for i in range(k):
            p = pts[de == i]
            if len(p) < 12:
                continue
            meio = p.mean(axis=0)
            hb = bmesh.new()
            for q in p:
                hb.verts.new(meio + (q - meio) * ENCOLHE)
            casca = bmesh.ops.convex_hull(hb, input=hb.verts[:])
            fora = {v for v in casca['geom_interior'] + casca['geom_unused'] if isinstance(v, bmesh.types.BMVert)}
            bmesh.ops.delete(hb, geom=list(fora), context='VERTS')
            bmesh.ops.recalc_face_normals(hb, faces=hb.faces[:])
            # os blocos de cima pegam mais sol: do pé da copa (0,8) ao alto (1,15)
            claro = 0.8 + 0.35 * (meio[2] - z0) / max(z1 - z0, 1e-6)
            partes.append((malha_reduzida(f'bloco{i}', hb, BLOCO_TRIS), cor_folha * claro))

    # tudo numa malha, a cor nos vértices
    junto = bmesh.new()
    camada = junto.loops.layers.float_color.new('Col')
    for m, cor in partes:
        ini = len(junto.faces)
        junto.from_mesh(m)
        junto.faces.ensure_lookup_table()
        for f in junto.faces[ini:]:
            f.smooth = False
            for l in f.loops:
                l[camada] = (float(cor[0]), float(cor[1]), float(cor[2]), 1.0)
    nova = bpy.data.meshes.new(nome)
    junto.to_mesh(nova)
    junto.free()
    # só a cor nova: a megakit traz a dela (quase branca), e o exportador pegaria a primeira
    for nome_at in [at.name for at in nova.color_attributes if at.name != 'Col'] + ['custom_normal']:
        if nome_at in nova.attributes:
            nova.attributes.remove(nova.attributes[nome_at])
    while nova.uv_layers:
        nova.uv_layers.remove(nova.uv_layers[0])
    nova.color_attributes.active_color = nova.color_attributes['Col']
    nova.color_attributes.render_color_index = 0

    mat = bpy.data.materials.new('lp_arvore')
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Roughness'].default_value = 1.0
    bsdf.inputs['Metallic'].default_value = 0.0
    atr = nt.nodes.new('ShaderNodeVertexColor')
    atr.layer_name = 'Col'
    nt.links.new(atr.outputs['Color'], bsdf.inputs['Base Color'])
    mat.use_backface_culling = True
    nova.materials.append(mat)

    obj = bpy.data.objects.new(orig.name, nova)
    bpy.context.scene.collection.objects.link(obj)
    obj.matrix_world = orig.matrix_world.copy()
    bpy.data.objects.remove(orig)
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    arq = os.path.join(SAIDA, nome + '.glb')
    bpy.ops.export_scene.gltf(filepath=arq, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
                              export_animations=False, export_tangents=False, export_texcoords=False,
                              export_vertex_color='MATERIAL', export_cameras=False, export_lights=False)
    depois = sum(len(p.vertices) - 2 for p in nova.polygons)
    d = obj.dimensions
    print(f'PECA|{nome}|{antes}->{depois}|blocos={len(partes) - 1}|{d.x:.2f} {d.z:.2f} {d.y:.2f}|{round(os.path.getsize(arq) / 1024)}KB')


for n in ARVORES:
    filtrar(n)
