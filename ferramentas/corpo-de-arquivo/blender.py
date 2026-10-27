# O BLENDER do corpo de arquivo (importar.mjs chama este script; não é para rodar à mão):
#
#   blender --background --factory-startup --python blender.py -- reduzir <entrada.glb> <saida.json> <triângulos>
#       lê o .glb (uma malha só), junta o que é plano e reduz até <triângulos> (colapso de arestas,
#       que guarda as facetas); grava { pos, idx } com y para cima (como no glTF)
#   blender --background --factory-startup --python blender.py -- pesar <malha.json> <ossos.json> <saida.json>
#       monta a armação (cabeça e ponta de cada osso, em y para cima) e pesa a malha pelo "calor"
#       dos ossos (o automático do Blender); grava, por vértice, até 4 [osso, peso]
#   blender --background --factory-startup --python blender.py -- simplificar <entrada.json> <saida.json>
#       a ferramenta SIMPLIFICAR (simplificar.mjs): junta as ilhas marcadas num ponto e reduz cada grupo (protegido não muda)
import bpy, sys, json, math

args = sys.argv[sys.argv.index('--') + 1:]
modo = args[0]
bpy.ops.wm.read_factory_settings(use_empty=True)
# glTF (x, y, z) com y para cima <-> Blender (x, -z, y)
paraB = lambda p: (p[0], -p[2], p[1])
deB = lambda v: [v.x, v.z, -v.y]

def triangulos(obj):
    return sum(len(p.vertices) - 2 for p in obj.data.polygons)

if modo == 'reduzir':
    entrada, saida, alvo = args[1], args[2], int(args[3])
    bpy.ops.import_scene.gltf(filepath=entrada)
    obj = [o for o in bpy.context.scene.objects if o.type == 'MESH'][0]
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    # (o modelo com textura vem com os pontos das costuras da UV repetidos: soldados, a cópia reduzida fica fechada — os
    # cortes do importar.mjs acham laços e o "calor" dos ossos pesa direito)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.remove_doubles(threshold=0.0001)
    bpy.ops.object.mode_set(mode='OBJECT')
    m = obj.modifiers.new('plano', 'DECIMATE'); m.decimate_type = 'DISSOLVE'; m.angle_limit = math.radians(2); m.delimit = set()
    bpy.ops.object.modifier_apply(modifier='plano')
    t = obj.modifiers.new('tri', 'TRIANGULATE'); t.quad_method = 'BEAUTY'; t.ngon_method = 'BEAUTY'
    bpy.ops.object.modifier_apply(modifier='tri')
    if triangulos(obj) > alvo:
        c = obj.modifiers.new('junta', 'DECIMATE'); c.decimate_type = 'COLLAPSE'; c.ratio = alvo / triangulos(obj); c.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier='junta')
    me = obj.data
    pos = []
    for v in me.vertices: pos += [round(x, 6) for x in deB(v.co)]
    idx = []
    for p in me.polygons: idx += list(p.vertices)
    json.dump({'pos': pos, 'idx': idx}, open(saida, 'w'))
    print('[corpo] reduzido:', triangulos(obj), 'triângulos')

elif modo == 'pesar':
    malha, ossos, saida = json.load(open(args[1])), json.load(open(args[2])), args[3]
    P = malha['pos']
    me = bpy.data.meshes.new('corpo')
    me.from_pydata([paraB(P[i:i + 3]) for i in range(0, len(P), 3)], [], [malha['idx'][i:i + 3] for i in range(0, len(malha['idx']), 3)])
    me.update()
    obj = bpy.data.objects.new('corpo', me)
    bpy.context.scene.collection.objects.link(obj)
    arm = bpy.data.armatures.new('armacao')
    rig = bpy.data.objects.new('armacao', arm)
    bpy.context.scene.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='EDIT')
    feitos = {}
    for o in ossos:
        b = arm.edit_bones.new(o['nome'])
        b.head = paraB(o['cabeca']); b.tail = paraB(o['ponta'])
        b.use_deform = o.get('deforma', True)
        if o.get('pai') in feitos: b.parent = feitos[o['pai']]
        feitos[o['nome']] = b
    bpy.ops.object.mode_set(mode='OBJECT')
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True); rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    nomes = {g.index: g.name for g in obj.vertex_groups}
    pesos, vazios = [], 0
    for v in me.vertices:
        w = sorted(((nomes[g.group], g.weight) for g in v.groups if g.weight > 1e-4), key=lambda x: -x[1])[:4]
        if not w: vazios += 1
        pesos.append([[n, round(p, 5)] for n, p in w])
    json.dump({'pesos': pesos}, open(saida, 'w'))
    print('[corpo] pesado:', len(pesos), 'vértices,', vazios, 'sem osso')

elif modo == 'simplificar':
    # A SIMPLIFICAÇÃO (simplificar.mjs; a ferramenta SIMPLIFICAR da aba Modelo): { pos, uv, idx, cats, alvo } — cats por
    # triângulo: 0 = normal, 1 = PROTEGER (não muda), 2 = REDUZIR MUITO, 3 = JUNTAR NUM PONTO (cada ilha vira um ponto, no
    # meio da beira dela: o buraco da narina fecha). Depois o redutor do Blender (colapso de arestas, que guarda o formato e a
    # UV) em cada grupo, até o total `alvo`. Grava { pos, uv, normal, idx } (y para cima, como no glTF)
    import bmesh
    from mathutils import Vector
    d, saida = json.load(open(args[1])), args[2]
    P, U, I, C, alvo = d['pos'], d['uv'], d['idx'], d['cats'], int(d['alvo'])
    nt = len(I) // 3
    me = bpy.data.meshes.new('corpo')
    me.from_pydata([paraB(P[i:i + 3]) for i in range(0, len(P), 3)], [], [I[3 * t:3 * t + 3] for t in range(nt)])
    uvl = me.uv_layers.new(name='uv')
    luv = [0.0] * (len(I) * 2)
    for k, v in enumerate(I): luv[2 * k] = U[2 * v]; luv[2 * k + 1] = U[2 * v + 1]
    uvl.data.foreach_set('uv', luv)
    me.attributes.new('cat', 'INT', 'FACE').data.foreach_set('value', C)
    me.validate(); me.update()
    obj = bpy.data.objects.new('corpo', me)
    bpy.context.scene.collection.objects.link(obj)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_mode(type='FACE')
    bm = bmesh.from_edit_mesh(me)
    # (os pontos repetidos nas costuras da UV, soldados: a UV fica em cada canto de triângulo, a costura continua)
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-5)
    cl = bm.faces.layers.int.get('cat')
    # 1. JUNTAR: cada ilha de triângulos marcados vira um ponto
    sobra = set(f for f in bm.faces if f[cl] == 3)
    ilhas = []
    while sobra:
        f0 = sobra.pop(); ilha = [f0]; pilha = [f0]
        while pilha:
            f = pilha.pop()
            for e in f.edges:
                for g in e.link_faces:
                    if g in sobra: sobra.remove(g); ilha.append(g); pilha.append(g)
        ilhas.append(ilha)
    juntados = 0
    for ilha in ilhas:
        ilha = [f for f in ilha if f.is_valid]
        if not ilha: continue
        dentro = set(ilha)
        vs = list({v for f in ilha for v in f.verts if v.is_valid})
        if len(vs) < 2: continue
        beira = [v for v in vs if any(g not in dentro for g in v.link_faces)]
        base = beira or vs
        co = sum((v.co for v in base), Vector()) / len(base)
        bmesh.ops.pointmerge(bm, verts=vs, merge_co=co)
        juntados += len(ilha)
    bmesh.update_edit_mesh(me)
    # 2. os grupos e a fração de cada um: o REDUZIR MUITO vai a 10% (ou 0,3 × a do normal, se esta for menor que 1/3)
    bm = bmesh.from_edit_mesh(me); cl = bm.faces.layers.int.get('cat')
    F = [0, 0, 0, 0]
    for f in bm.faces: F[min(3, max(0, f[cl]))] += 1
    F0, F1, F2 = F[0] + F[3], F[1], F[2]
    r0 = (alvo - F1 - 0.1 * F2) / F0 if F0 else 1
    r2 = 0.1
    if r0 < 1 / 3:
        r0 = (alvo - F1) / (F0 + 0.3 * F2) if F0 + 0.3 * F2 else 1
        r2 = 0.3 * r0
    r0 = min(1.0, max(0.01, r0)); r2 = min(1.0, max(0.005, r2))
    print('[corpo] simplificar: %d juntados; normal %d (×%.3f), protegido %d, reduzir muito %d (×%.3f) → alvo %d' % (juntados, F0, r0, F1, F2, r2, alvo))
    def reduzir(cats, r):
        if r >= 0.999: return
        bm = bmesh.from_edit_mesh(me); cl = bm.faces.layers.int.get('cat')
        bpy.ops.mesh.select_all(action='DESELECT')
        n = 0
        for f in bm.faces:
            if f[cl] in cats: f.select_set(True); n += 1
        bmesh.update_edit_mesh(me)
        if n: bpy.ops.mesh.decimate(ratio=r)
    reduzir((2,), r2)
    reduzir((0, 3), r0)
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.quads_convert_to_tris()
    # 3. a saída: um ponto por (vértice, UV) — a costura da UV volta a ter pontos repetidos
    bm = bmesh.from_edit_mesh(me)
    bm.verts.index_update(); bm.normal_update()
    uvl = bm.loops.layers.uv.active
    chave, pos, uv, nor, idx = {}, [], [], [], []
    for f in bm.faces:
        if len(f.verts) != 3: continue
        for lp in f.loops:
            u = lp[uvl].uv
            k = (lp.vert.index, round(u[0], 6), round(u[1], 6))
            i = chave.get(k)
            if i is None:
                i = chave[k] = len(chave)
                pos += [round(x, 6) for x in deB(lp.vert.co)]; uv += [round(u[0], 6), round(u[1], 6)]; nor += [round(x, 5) for x in deB(lp.vert.normal)]
            idx.append(i)
    json.dump({'pos': pos, 'uv': uv, 'normal': nor, 'idx': idx}, open(saida, 'w'))
    print('[corpo] simplificado:', len(idx) // 3, 'triângulos,', len(chave), 'pontos')
