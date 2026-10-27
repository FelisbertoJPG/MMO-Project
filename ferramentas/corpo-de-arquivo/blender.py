# O BLENDER do corpo de arquivo (importar.mjs chama este script; não é para rodar à mão):
#
#   blender --background --factory-startup --python blender.py -- reduzir <entrada.glb> <saida.json> <triângulos>
#       lê o .glb (uma malha só), junta o que é plano e reduz até <triângulos> (colapso de arestas,
#       que guarda as facetas); grava { pos, idx } com y para cima (como no glTF)
#   blender --background --factory-startup --python blender.py -- pesar <malha.json> <ossos.json> <saida.json>
#       monta a armação (cabeça e ponta de cada osso, em y para cima) e pesa a malha pelo "calor"
#       dos ossos (o automático do Blender); grava, por vértice, até 4 [osso, peso]
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
