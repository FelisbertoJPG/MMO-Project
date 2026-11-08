# O BLENDER do corpo de arquivo (importar.mjs chama este script; não é para rodar à mão):
#
#   blender --background --factory-startup --python blender.py -- reduzir <entrada.glb> <saida.json> <triângulos>
#       lê o .glb (uma malha só), junta o que é plano e reduz até <triângulos> (colapso de arestas,
#       que guarda as facetas); grava { pos, idx } com y para cima (como no glTF)
#   blender --background --factory-startup --python blender.py -- pesar <malha.json> <ossos.json> <saida.json>
#       monta a armação (cabeça e ponta de cada osso, em y para cima) e pesa a malha pelo "calor"
#       dos ossos (o automático do Blender); grava, por vértice, até 4 [osso, peso]
#   blender --background --factory-startup --python blender.py -- simplificar <entrada.json> <saida.json>
#       a ferramenta SIMPLIFICAR (simplificar.mjs): espelha um lado no outro (se pedida a simetria), junta as ilhas marcadas
#       num ponto e reduz cada grupo (protegido não muda; com a simetria, os dois lados por igual)
#   blender --background --factory-startup --python blender.py -- simetrizar <entrada.json> <saida.glb>
#       a SIMETRIA (simetria.mjs): { pos, idx, lado } — o lado copiado no outro pelo x = 0 (1 = o +x), buracos fechados; grava o .glb com as normais
#   blender --background --factory-startup --python blender.py -- uniao <entrada.json> <saida.json>
#       a UNIÃO de duas malhas (fundir-uniao.mjs): { a: { pos, idx }, b: { pos, idx } } — os furinhos de b fechados e o booleano exato; fica o lado de fora das duas; grava { pos, idx }
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
    # 0. a SIMETRIA (01/11/2026; o dono: "impedir o modelo de perder simetria ao simplificar, e até aplicar simetria nesse
    # momento"): `simetria` 1 = o lado +x (o esquerdo DELA) é copiado no outro; -1 = o −x (o direito dela). O plano é x = 0
    # (o meio do Meshy, medido: 0,00 cm no corpo, na cabeça e no rosto). Vão juntos a forma, a UV (os dois lados pegam a
    # textura do lado copiado) e a pintura; depois o redutor reduz os dois lados por igual (use_symmetry, abaixo)
    sim = int(d.get('simetria') or 0)
    if sim:
        bmesh.ops.symmetrize(bm, input=bm.verts[:] + bm.edges[:] + bm.faces[:], direction='X' if sim > 0 else '-X', dist=1e-4)
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
    print('[corpo] simplificar: %s%d juntados; normal %d (×%.3f), protegido %d, reduzir muito %d (×%.3f) → alvo %d' % ({1: 'simetria (o +x copiado); ', -1: 'simetria (o −x copiado); '}.get(sim, ''), juntados, F0, r0, F1, F2, r2, alvo))
    def reduzir(cats, r):
        if r >= 0.999: return
        bm = bmesh.from_edit_mesh(me); cl = bm.faces.layers.int.get('cat')
        bpy.ops.mesh.select_all(action='DESELECT')
        n = 0
        for f in bm.faces:
            if f[cl] in cats: f.select_set(True); n += 1
        bmesh.update_edit_mesh(me)
        if n: bpy.ops.mesh.decimate(ratio=r, use_symmetry=bool(sim), symmetry_axis='X')
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
elif modo == 'simetrizar':
    # A SIMETRIA (simetria.mjs; 02/11/2026): o espelho do Blender no x = 0. Depois, os BURACOS fechados: o que o holes_fill fecha, e o que
    # sobra — a narina do Meshy, dois furos que se tocam num ponto — vira UM ponto no meio da beira (o "juntar num ponto" do Simplificar)
    import bmesh
    from mathutils import Vector
    d, saida = json.load(open(args[1])), args[2]
    P, I = d['pos'], d['idx']
    me = bpy.data.meshes.new('corpo')
    me.from_pydata([paraB(P[i:i + 3]) for i in range(0, len(P), 3)], [], [I[t:t + 3] for t in range(0, len(I), 3)])
    me.validate(); me.update()
    obj = bpy.data.objects.new('corpo', me)
    bpy.context.scene.collection.objects.link(obj)
    bm = bmesh.new(); bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    n0 = len(bm.faces)
    bmesh.ops.symmetrize(bm, input=bm.verts[:] + bm.edges[:] + bm.faces[:], direction='X' if d.get('lado', 1) > 0 else '-X', dist=1e-4)
    bmesh.ops.holes_fill(bm, edges=[e for e in bm.edges if e.is_boundary], sides=0)
    borda = set(v for e in bm.edges if e.is_boundary for v in e.verts)
    while borda:
        v0 = borda.pop(); grupo = {v0}; fila = [v0]
        while fila:
            v = fila.pop()
            for e in v.link_edges:
                if e.is_boundary:
                    o = e.other_vert(v)
                    if o in borda: borda.discard(o); grupo.add(o); fila.append(o)
        meio = sum((v.co for v in grupo), Vector()) / len(grupo)
        bmesh.ops.pointmerge(bm, verts=list(grupo), merge_co=meio)
        print('[corpo] buraco fechado num ponto: %d pontos em x %.3f, altura %.3f' % (len(grupo), meio.x, meio.z))
    bmesh.ops.dissolve_degenerate(bm, edges=bm.edges[:], dist=1e-5)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    print('[corpo] simetria: %d -> %d faces' % (n0, len(bm.faces)))
    bm.to_mesh(me); bm.free()
    for pl in me.polygons: pl.use_smooth = True   # (liso: o .glb não repete o ponto por face)
    bpy.ops.export_scene.gltf(filepath=saida, export_format='GLB', export_normals=True, export_texcoords=False, export_materials='NONE', export_yup=True, use_selection=False)

elif modo == 'uniao':
    import bmesh
    d = json.load(open(args[1], encoding='utf-8'))
    def malha(nome, m, fechar):
        pos, idx = m['pos'], m['idx']
        me = bpy.data.meshes.new(nome)
        me.from_pydata([pos[i:i + 3] for i in range(0, len(pos), 3)], [], [idx[i:i + 3] for i in range(0, len(idx), 3)])
        me.update()
        ob = bpy.data.objects.new(nome, me)
        bpy.context.scene.collection.objects.link(ob)
        if fechar:
            bm = bmesh.new(); bm.from_mesh(me)
            bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
            # (fecha até não sobrar nada: o buraco; a beira que se toca, num ponto; a aresta de mais de duas faces, onde duas superfícies se tocam, num ponto. Sempre na
            # mesma ordem, pelo número do ponto: com a ordem do conjunto do Python, cada rodada dava outra malha)
            from mathutils import Vector
            for volta in range(12):
                bmesh.ops.holes_fill(bm, edges=[e for e in bm.edges if e.is_boundary], sides=0)
                bm.verts.ensure_lookup_table(); bm.verts.index_update()
                borda = set(v for e in bm.edges if e.is_boundary for v in e.verts)
                while borda:
                    v0 = min(borda, key=lambda v: v.index); borda.discard(v0); grupo = {v0}; fila = [v0]
                    while fila:
                        v = fila.pop()
                        for e in v.link_edges:
                            if e.is_boundary:
                                o = e.other_vert(v)
                                if o in borda: borda.discard(o); grupo.add(o); fila.append(o)
                    bmesh.ops.pointmerge(bm, verts=sorted(grupo, key=lambda v: v.index), merge_co=sum((v.co for v in sorted(grupo, key=lambda v: v.index)), Vector()) / len(grupo))
                bmesh.ops.dissolve_degenerate(bm, edges=bm.edges[:], dist=1e-5)
                bmesh.ops.triangulate(bm, faces=bm.faces[:])
                bm.edges.ensure_lookup_table(); bm.edges.index_update()
                ruins = sorted((e for e in bm.edges if len(e.link_faces) > 2), key=lambda e: e.index)
                if ruins:
                    bmesh.ops.collapse(bm, edges=ruins[:1], uvs=False)
                    bmesh.ops.dissolve_degenerate(bm, edges=bm.edges[:], dist=1e-5)
                    bmesh.ops.triangulate(bm, faces=bm.faces[:])
                if not ruins and not any(e.is_boundary for e in bm.edges): break
            bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
            print('[corpo] %s: %d faces, depois de fechar %d arestas abertas e %d com mais de duas faces' % (nome, len(bm.faces), sum(1 for e in bm.edges if e.is_boundary), sum(1 for e in bm.edges if len(e.link_faces) > 2)))
            bm.to_mesh(me); bm.free()
        return ob
    A = malha('corpo', d['a'], False); B = malha('peca', d['b'], True)
    if d.get('corte'):
        # (a peça só acima da linha do dono: o sólido do corte é o que fica)
        C = malha('corte', d['corte'], False)
        bpy.context.view_layer.objects.active = B; B.select_set(True)
        c = B.modifiers.new('corte', 'BOOLEAN'); c.operation = 'INTERSECT'; c.object = C; c.solver = 'EXACT'; c.use_self = False; c.use_hole_tolerant = False
        bpy.ops.object.modifier_apply(modifier='corte')
        B.select_set(False)
        print('[corpo] a peça cortada na linha: %d faces' % len(B.data.polygons))
    bpy.context.view_layer.objects.active = A; A.select_set(True)
    u = A.modifiers.new('uniao', 'BOOLEAN'); u.operation = 'UNION'; u.object = B; u.solver = 'EXACT'; u.use_self = False; u.use_hole_tolerant = False
    bpy.ops.object.modifier_apply(modifier='uniao')
    me = A.data
    bm = bmesh.new(); bm.from_mesh(me)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bm.to_mesh(me); bm.free()
    pos = [c for v in me.vertices for c in v.co]; idx = [i for p in me.polygons for i in p.vertices]
    # as peças à parte (os olhos): só fechadas, sem entrar no booleano
    for n, x in enumerate(d.get('extras', [])):
        o = malha('extra%d' % n, x, True).data; base = len(pos) // 3
        pos += [c for v in o.vertices for c in v.co]; idx += [i + base for p in o.polygons for i in p.vertices]
    json.dump({ 'pos': pos, 'idx': idx }, open(args[2], 'w', encoding='utf-8'))
