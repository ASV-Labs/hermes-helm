"""Procedural cute robot in Blender (bpy), rendered as alpha layers.

Parts: topper (antenna, cat, sprout, cap, goggles, dish, bunny, beanie, crown, headphones),
face (idle, happy, focused, question, error, sleep, heart, star, wink, tongue),
chest (planet, heart, gear, leaf, bars, paw, recycle, bolt), tool (none, wrench, claw, drill,
flashlight, magnet, camera), back (none, backpack, jetpack, cape, satchel, scarf, bow),
colour (white, gold, pink, purple, green, blue, graphite).
"""
import bpy, math, os, sys
from mathutils import Vector, Euler

COLORS = {
    'blue':     {'accent': (0.20, 0.62, 0.90), 'glow': (0.35, 0.85, 1.00)},
    'purple':   {'accent': (0.55, 0.40, 0.85), 'glow': (0.75, 0.60, 1.00)},
    'green':    {'accent': (0.30, 0.70, 0.45), 'glow': (0.45, 1.00, 0.65)},
    'gold':     {'accent': (0.85, 0.65, 0.20), 'glow': (1.00, 0.85, 0.35)},
    'pink':     {'accent': (0.90, 0.40, 0.60), 'glow': (1.00, 0.55, 0.75)},
    'graphite': {'accent': (0.22, 0.24, 0.27), 'glow': (0.80, 0.85, 0.90)},
    'white':    {'accent': (0.80, 0.84, 0.88), 'glow': (0.60, 0.90, 1.00)},
}

# ------------------------------------------------------------------ materials
_mats = {}

def mat(name, base=(0.9,0.9,0.9), rough=0.3, metal=0.0, emit=None, strength=0.0, coat=0.0, alpha=1.0, transmission=0.0):
    key = (name, base, rough, metal, emit, strength, coat, alpha, transmission)
    if key in _mats:
        return _mats[key]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*base, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    b.inputs['Coat Weight'].default_value = coat
    b.inputs['Alpha'].default_value = alpha
    b.inputs['Transmission Weight'].default_value = transmission
    if emit is not None:
        b.inputs['Emission Color'].default_value = (*emit, 1)
        b.inputs['Emission Strength'].default_value = strength
    _mats[key] = m
    return m

_CUR = {'col': 'white'}
def set_colour(col):
    _CUR['col'] = col
def shell_mat():
    a = COLORS[_CUR['col']]['accent']
    t = 0.0 if _CUR['col'] in ('white', 'graphite') else 0.16
    base = tuple(0.94*(1-t) + a[i]*t for i in range(3))
    return mat('shell', base=base, rough=0.30, coat=0.7)
def shell_shade_mat():
    a = COLORS[_CUR['col']]['accent']
    t = 0.0 if _CUR['col'] in ('white', 'graphite') else 0.22
    base = tuple(0.82*(1-t) + a[i]*t for i in range(3))
    return mat('shellshade', base=base, rough=0.4)
def glass_mat():
    return mat('visor', base=(0.015, 0.02, 0.03), rough=0.08, coat=1.0)
def dark_mat():
    return mat('dark', base=(0.06, 0.07, 0.09), rough=0.5)
def metal_mat():
    return mat('metal', base=(0.55, 0.58, 0.62), rough=0.35, metal=1.0)
def accent_mat(col):
    return mat('accent', base=COLORS[col]['accent'], rough=0.35, coat=0.4)
def glow_mat(col, strength=2.4):
    g = COLORS[col]['glow']
    return mat('glow', base=g, emit=g, strength=strength, rough=0.4)

# ------------------------------------------------------------------ helpers
def smooth(ob):
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob

def link(ob, coll):
    for c in list(ob.users_collection):
        c.objects.unlink(ob)
    coll.objects.link(ob)
    return ob

def sphere(name, r, loc, scale=(1,1,1), m=None, coll=None, seg=48):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, segments=seg, ring_count=seg//2, location=loc)
    ob = bpy.context.object; ob.name = name; ob.scale = scale
    smooth(ob)
    if m: ob.data.materials.append(m)
    if coll: link(ob, coll)
    return ob

def rbox(name, size, loc, bevel, m=None, coll=None, rot=(0,0,0), segs=10):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    ob = bpy.context.object; ob.name = name; ob.scale = size; ob.rotation_euler = rot
    bpy.ops.object.transform_apply(scale=True)
    mod = ob.modifiers.new('bevel', 'BEVEL'); mod.width = bevel; mod.segments = segs; mod.limit_method = 'NONE'
    sub = ob.modifiers.new('sub', 'SUBSURF'); sub.levels = 2; sub.render_levels = 3
    smooth(ob)
    if m: ob.data.materials.append(m)
    if coll: link(ob, coll)
    return ob

def cyl(name, r, depth, loc, m=None, coll=None, rot=(0,0,0), verts=48, scale=(1,1,1)):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=depth, location=loc, rotation=rot, vertices=verts)
    ob = bpy.context.object; ob.name = name; ob.scale = scale
    smooth(ob)
    if m: ob.data.materials.append(m)
    if coll: link(ob, coll)
    return ob

def torus(name, R, r, loc, m=None, coll=None, rot=(0,0,0)):
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, location=loc, rotation=rot, major_segments=64, minor_segments=24)
    ob = bpy.context.object; ob.name = name
    smooth(ob)
    if m: ob.data.materials.append(m)
    if coll: link(ob, coll)
    return ob

def capsule(name, r, length, a, b, m=None, coll=None):
    """Capsule from point a to point b."""
    a = Vector(a); b = Vector(b)
    d = b - a; L = d.length; mid = (a + b) / 2
    rot = d.to_track_quat('Z', 'Y').to_euler()
    c = cyl(name, r, L, mid, m, coll, rot=rot)
    s1 = sphere(name+'_a', r, a, m=m, coll=coll); s2 = sphere(name+'_b', r, b, m=m, coll=coll)
    return [c, s1, s2]

def new_coll(name):
    c = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(c)
    return c

# ------------------------------------------------------------------ geometry
# Robot sits on the floor (z=0). Units ~ metres; whole bot ~2.5 tall.
HEAD_C = Vector((0, 0, 1.70))
HEAD_SIZE = (1.56, 1.20, 1.16)
BODY_C = Vector((0, 0.04, 0.70))
EAR_X = 0.80
EYE_Z = 1.70
VIS_Y = HEAD_C.y - 0.52

def joint_mat():
    return mat('joint', base=(0.16, 0.17, 0.20), rough=0.45, metal=0.3)

def build_base(col, coll):
    set_colour(col)
    """Head + body + ears + legs + arms (no face, no topper, no chest icon, no tool, no back)."""
    sh = shell_mat(); acc = accent_mat(col); gl = glow_mat(col, 3.2); jm = joint_mat()
    # head: rounded helmet
    rbox('head', HEAD_SIZE, HEAD_C, 0.52, sh, coll)
    # visor: dark glossy glass, large, inset into the front with a thin shell lip
    rbox('visor_lip', (1.34, 0.20, 0.94), HEAD_C + Vector((0, -0.50, -0.02)), 0.30, shell_shade_mat(), coll)
    rbox('visor', (1.26, 0.22, 0.86), HEAD_C + Vector((0, -0.54, -0.02)), 0.28, glass_mat(), coll)
    # ears: side pods with accent glow ring and dark core
    for sx in (-1, 1):
        cyl('ear_pod', 0.34, 0.20, (sx*EAR_X, 0.0, 1.66), sh, coll, rot=(0, math.pi/2, 0))
        torus('ear_ring', 0.25, 0.05, (sx*(EAR_X+0.09), 0.0, 1.66), gl, coll, rot=(0, math.pi/2, 0))
        cyl('ear_core', 0.20, 0.06, (sx*(EAR_X+0.10), 0.0, 1.66), dark_mat(), coll, rot=(0, math.pi/2, 0))
    # neck joint (dark)
    cyl('neck', 0.30, 0.18, (0, 0.03, 1.16), jm, coll)
    # body (egg) with dark lower band
    sphere('body', 0.56, BODY_C, scale=(1.0, 0.90, 1.08), m=sh, coll=coll)
    sphere('hips', 0.50, BODY_C + Vector((0, 0, -0.30)), scale=(1.0, 0.9, 0.7), m=jm, coll=coll)
    # chest panel housing (dark glass with accent frame); icon is its own layer
    rbox('panel_frame', (0.54, 0.12, 0.52), BODY_C + Vector((0, -0.50, 0.06)), 0.10, acc, coll)
    rbox('panel', (0.44, 0.12, 0.42), BODY_C + Vector((0, -0.535, 0.06)), 0.08, glass_mat(), coll)
    # arms: dark shoulder joint, white upper arm, dark elbow, white forearm, dark wrist, white hand, dark fingers
    for sx in (-1, 1):
        sh_pt = Vector((sx*0.56, 0.0, 0.92))
        sphere('shoulder', 0.16, sh_pt, m=jm, coll=coll)
        elbow = Vector((sx*0.92, -0.14, 0.72))
        capsule('upperarm', 0.13, 0, sh_pt, elbow, m=sh, coll=coll)
        sphere('elbow', 0.14, elbow, m=jm, coll=coll)
        hand = Vector((sx*1.06, -0.50, 1.00))
        capsule('forearm', 0.12, 0, elbow, hand, m=sh, coll=coll)
        sphere('wrist', 0.11, hand - Vector((0, -0.06, 0.06)), m=jm, coll=coll)
        sphere('hand', 0.17, hand, scale=(1, 0.85, 1), m=sh, coll=coll)
        for ang in (-0.6, 0.0, 0.6):
            fx = hand.x + sx*0.10*math.cos(ang)
            fz = hand.z + 0.16*math.sin(ang) + 0.12
            capsule('finger', 0.05, 0, (fx, hand.y-0.08, fz), (fx, hand.y-0.20, fz+0.04), m=jm, coll=coll)
    # legs: short, forward (sitting); dark knee; big round feet with glow rings
    for sx in (-1, 1):
        hip = Vector((sx*0.34, -0.08, 0.34))
        knee = Vector((sx*0.46, -0.52, 0.30))
        capsule('thigh', 0.18, 0, hip, knee, m=sh, coll=coll)
        sphere('knee', 0.17, knee, m=jm, coll=coll)
        foot = Vector((sx*0.50, -0.80, 0.30))
        sphere('foot', 0.30, foot, scale=(1, 0.80, 1), m=sh, coll=coll)
        torus('foot_ring', 0.19, 0.045, (sx*0.50, -1.02, 0.30), gl, coll, rot=(math.pi/2, 0, 0))
        cyl('foot_core', 0.15, 0.04, (sx*0.50, -1.025, 0.30), dark_mat(), coll, rot=(math.pi/2, 0, 0))

def heart(name, cx, y, cz, r, m, coll):
    """Two lobes and a downward point: reads as a heart, not a paw."""
    sphere(name, r, (cx - r*0.62, y, cz + r*0.25), scale=(1, 0.45, 1), m=m, coll=coll)
    sphere(name, r, (cx + r*0.62, y, cz + r*0.25), scale=(1, 0.45, 1), m=m, coll=coll)
    bpy.ops.mesh.primitive_cone_add(radius1=r*1.45, radius2=0.0, depth=r*1.9, vertices=32, location=(cx, y, cz - r*0.62), rotation=(math.pi, 0, 0))
    ob = bpy.context.object; ob.name = name; ob.scale = (1, 0.32, 1); smooth(ob); ob.data.materials.append(m); link(ob, coll)

# ---- faces: emissive shapes on the visor plane (y = SCREEN_Y + head)
FY = HEAD_C.y - 0.66

def eye_shape(name, loc, kind, col, coll, scale=(1,1,1)):
    g = glow_mat(col, 2.8)
    if kind == 'oval':
        outer = glow_mat(col, 1.5); inner = glow_mat(col, 3.4)
        e = sphere(name, 0.19, loc, scale=(1.0*scale[0], 0.30, 1.22*scale[2]), m=outer, coll=coll)
        sphere(name+'_in', 0.135, (loc[0], loc[1]-0.02, loc[2]-0.01), scale=(1.0*scale[0], 0.30, 1.2*scale[2]), m=inner, coll=coll)
        sphere(name+'_hl', 0.05, (loc[0]-0.06, loc[1]-0.07, loc[2]+0.10), scale=(1,0.4,1), m=mat('hl', base=(1,1,1), emit=(1,1,1), strength=4.0), coll=coll)
        return e
    if kind == 'dot':
        return sphere(name, 0.07, loc, scale=(1*scale[0], 0.5, 1*scale[2]), m=g, coll=coll)

def arc(name, loc, col, coll, r=0.11, width=0.035, flip=False, span=(0.15, 0.85)):
    """Smile/happy-eye arc: a torus segment approximated by a bent chain of small spheres."""
    g = glow_mat(col, 2.8)
    obs = []
    n = 26
    for i in range(n):
        t = span[0] + (span[1]-span[0]) * i/(n-1)
        a = math.pi * t
        x = loc[0] + r*math.cos(a)
        z = loc[2] + (r*math.sin(a) if not flip else -r*math.sin(a)) * 0.8
        obs.append(sphere(name, width, (x, loc[1], z), scale=(1, 0.5, 1), m=g, coll=coll))
    return obs

def line(name, a, b, col, coll, width=0.035):
    g = glow_mat(col, 2.8)
    return capsule(name, width, 0, a, b, m=g, coll=coll)

def build_face(kind, col, coll):
    y = FY
    L = (-0.30, y, EYE_Z+0.02); R = (0.30, y, EYE_Z+0.02)
    if kind == 'idle':
        eye_shape('eye', L, 'oval', col, coll); eye_shape('eye', R, 'oval', col, coll)
        arc('mouth', (0, y, EYE_Z-0.24), col, coll, r=0.10, width=0.034, flip=True)
    elif kind == 'focused':
        rbox('eye', (0.16, 0.04, 0.20), L, 0.05, glow_mat(col, 2.8), coll)
        rbox('eye', (0.16, 0.04, 0.20), R, 0.05, glow_mat(col, 2.8), coll)
    elif kind == 'happy':
        arc('eye', L, col, coll); arc('eye', R, col, coll)
        arc('mouth', (0, y, EYE_Z-0.22), col, coll, r=0.09, width=0.03, flip=True)
    elif kind == 'question':
        for x in (-0.26, 0.26):
            arc('q', (x, y, EYE_Z+0.04), col, coll, r=0.08, width=0.028, span=(-0.1, 1.0))
            line('q', (x+0.08, y, EYE_Z+0.04), (x+0.02, y, EYE_Z-0.06), col, coll, 0.028)
            sphere('q', 0.03, (x+0.02, y, EYE_Z-0.14), scale=(1,0.5,1), m=glow_mat(col, 2.8), coll=coll)
    elif kind == 'error':
        for x in (-0.26, 0.26):
            line('x', (x-0.09, y, EYE_Z+0.09), (x+0.09, y, EYE_Z-0.09), col, coll, 0.03)
            line('x', (x-0.09, y, EYE_Z-0.09), (x+0.09, y, EYE_Z+0.09), col, coll, 0.03)
        arc('mouth', (0, y, EYE_Z-0.20), col, coll, r=0.07, width=0.025, flip=False)
    elif kind == 'sleep':
        for x in (-0.26, 0.26):
            line('z', (x-0.1, y, EYE_Z), (x+0.1, y, EYE_Z), col, coll, 0.032)
    elif kind == 'heart':
        for x in (-0.30, 0.30):
            heart('h', x, y, EYE_Z + 0.02, 0.085, glow_mat(col, 2.8), coll)
        arc('mouth', (0, y, EYE_Z-0.22), col, coll, r=0.07, width=0.025, flip=True)
    elif kind == 'star':
        for x in (-0.26, 0.26):
            line('s', (x-0.1, y, EYE_Z), (x+0.1, y, EYE_Z), col, coll, 0.03)
            line('s', (x, y, EYE_Z-0.1), (x, y, EYE_Z+0.1), col, coll, 0.03)
            line('s', (x-0.07, y, EYE_Z-0.07), (x+0.07, y, EYE_Z+0.07), col, coll, 0.022)
            line('s', (x-0.07, y, EYE_Z+0.07), (x+0.07, y, EYE_Z-0.07), col, coll, 0.022)
        arc('mouth', (0, y, EYE_Z-0.22), col, coll, r=0.08, width=0.028, flip=True)
    elif kind == 'wink':
        eye_shape('eye', L, 'oval', col, coll); arc('eye', R, col, coll)
        arc('mouth', (0, y, EYE_Z-0.22), col, coll, r=0.08, width=0.028, flip=True)
    elif kind == 'tongue':
        arc('eye', L, col, coll); arc('eye', R, col, coll)
        arc('mouth', (0, y, EYE_Z-0.20), col, coll, r=0.1, width=0.03, flip=True)
        sphere('tongue', 0.06, (0.05, y, EYE_Z-0.30), scale=(1,0.5,1.2), m=mat('tongue', base=(1,0.45,0.65), emit=(1,0.45,0.65), strength=1.2), coll=coll)
    # cheeks on most faces
    if kind in ('happy', 'heart', 'wink', 'tongue', 'idle'):
        for x in (-0.52, 0.52):
            sphere('cheek', 0.06, (x, y+0.02, EYE_Z-0.1), scale=(1.4,0.4,0.8), m=mat('cheek', base=(1,0.5,0.7), emit=(1,0.5,0.7), strength=0.6), coll=coll)

# ---- toppers
def build_topper(kind, col, coll):
    top = HEAD_C.z + HEAD_SIZE[2]/2
    acc = accent_mat(col); gl = glow_mat(col, 2.2); sh = shell_mat()
    if kind == 'antenna':
        cyl('ant_rod', 0.035, 0.42, (0, 0, top + 0.18), metal_mat(), coll)
        sphere('ant_ball', 0.14, (0, 0, top + 0.44), m=gl, coll=coll)
        torus('ant_base', 0.09, 0.03, (0, 0, top - 0.02), shell_shade_mat(), coll)
    elif kind == 'cat':
        for sx in (-1, 1):
            bpy.ops.mesh.primitive_cone_add(radius1=0.26, radius2=0.03, depth=0.5, location=(sx*0.46, 0.0, top + 0.12), rotation=(0.1, sx*0.45, 0))
            ob = bpy.context.object; ob.name = 'ear'; smooth(ob); ob.data.materials.append(sh)
            m = ob.modifiers.new('b', 'BEVEL'); m.width = 0.06; m.segments = 6
            link(ob, coll)
            bpy.ops.mesh.primitive_cone_add(radius1=0.15, radius2=0.02, depth=0.32, location=(sx*0.45, -0.06, top + 0.10), rotation=(0.1, sx*0.45, 0))
            ob2 = bpy.context.object; ob2.name = 'ear_in'; smooth(ob2); ob2.data.materials.append(gl); link(ob2, coll)
    elif kind == 'sprout':
        cyl('stem', 0.03, 0.3, (0, 0, top + 0.13), mat('stem', base=(0.25,0.5,0.2)), coll)
        for sx, rz in ((-1, 0.5), (1, -0.6)):
            sphere('leaf', 0.17, (sx*0.14, 0, top + 0.3), scale=(1.4, 0.4, 0.8), m=mat('leaf', base=(0.45,0.8,0.35), rough=0.5), coll=coll)
    elif kind == 'cap':
        capm = mat('cap', base=(0.45,0.30,0.18), rough=0.7)
        sphere('cap_dome', 0.84, (0, 0.04, top - 0.30), scale=(1, 0.80, 0.62), m=capm, coll=coll)
        rbox('brim', (1.0, 0.56, 0.07), (0, -0.74, top - 0.16), 0.03, capm, coll, rot=(0.22,0,0))
        sphere('cap_btn', 0.07, (0, 0.04, top + 0.22), m=acc, coll=coll)
    elif kind == 'goggles':
        zz = top - 0.20
        rbox('strap', (1.62, 1.26, 0.13), (0, 0.0, zz), 0.06, mat('leather', base=(0.35,0.22,0.12), rough=0.6), coll)
        for sx in (-1, 1):
            cyl('lens_rim', 0.20, 0.14, (sx*0.30, -0.60, zz + 0.02), mat('brass', base=(0.6,0.45,0.2), metal=1, rough=0.35), coll, rot=(math.radians(80), 0, 0))
            cyl('lens', 0.16, 0.06, (sx*0.30, -0.66, zz + 0.03), mat('lens', base=(0.2,0.6,0.8), rough=0.05, coat=1, emit=(0.3,0.7,0.9), strength=0.5), coll, rot=(math.radians(80), 0, 0))
    elif kind == 'dish':
        cyl('d_rod', 0.03, 0.34, (0.30, 0, top + 0.15), metal_mat(), coll)
        sphere('dish', 0.21, (0.30, 0, top + 0.36), scale=(1, 0.38, 1), m=mat('dishm', base=(0.85,0.87,0.9), rough=0.25, metal=0.6), coll=coll)
        sphere('d_tip', 0.045, (0.30, -0.12, top + 0.36), m=gl, coll=coll)
    elif kind == 'bunny':
        for sx in (-1, 1):
            sphere('bun', 0.14, (sx*0.3, 0, top + 0.42), scale=(0.9, 0.5, 2.6), m=mat('bun', base=(0.8,0.7,0.95), rough=0.6), coll=coll)
            sphere('bun_in', 0.09, (sx*0.3, -0.06, top + 0.42), scale=(0.8, 0.4, 2.2), m=mat('bunin', base=(1,0.7,0.85), rough=0.6), coll=coll)
    elif kind == 'beanie':
        sphere('beanie', 0.7, (0, 0.02, top - 0.4), scale=(1, 0.86, 0.9), m=mat('wool', base=(0.5,0.35,0.75), rough=0.9), coll=coll)
        torus('beanie_rim', 0.62, 0.09, (0, 0.02, top - 0.08), mat('wool2', base=(0.42,0.28,0.65), rough=0.9), coll)
        sphere('pom', 0.14, (0, 0.02, top + 0.26), m=mat('pom', base=(0.95,0.92,0.98), rough=0.95), coll=coll)
    elif kind == 'crown':
        gold = mat('goldm', base=(1.0,0.78,0.25), metal=1, rough=0.25)
        cyl('crown_band', 0.36, 0.16, (0, 0, top + 0.06), gold, coll, verts=6)
        for i in range(6):
            a = i/6*2*math.pi
            sphere('crown_pt', 0.06, (0.34*math.cos(a), 0.34*math.sin(a), top + 0.22), m=gold, coll=coll)
    elif kind == 'headphones':
        torus('hp_band', 0.86, 0.06, (0, 0.02, 1.66), mat('hp', base=(0.9,0.45,0.65), rough=0.5), coll, rot=(math.pi/2, 0, 0))
        for sx in (-1, 1):
            cyl('hp_cup', 0.34, 0.16, (sx*(EAR_X+0.12), 0.02, 1.60), mat('hp', base=(0.9,0.45,0.65), rough=0.5), coll, rot=(0, math.pi/2, 0))

# ---- chest module icons (emissive, on the panel plane)
PY = BODY_C.y - 0.68
PZ = BODY_C.z + 0.08
def build_chest(kind, col, coll):
    g = glow_mat(col, 2.4); y = PY; z = PZ
    if kind == 'planet':
        sphere('pl', 0.09, (0, y, z), scale=(1,0.5,1), m=g, coll=coll)
        torus('ring', 0.18, 0.022, (0, y, z), g, coll, rot=(math.radians(28), math.radians(-22), 0.0))
    elif kind == 'heart':
        heart('h', 0, y, z + 0.01, 0.075, g, coll)
    elif kind == 'gear':
        torus('gear', 0.10, 0.035, (0, y, z), g, coll, rot=(math.pi/2, 0, 0))
        for i in range(8):
            a = i/8*2*math.pi
            rbox('tooth', (0.06, 0.04, 0.06), (0.15*math.cos(a), y, z+0.15*math.sin(a)), 0.015, g, coll, rot=(0, a, 0), segs=3)
    elif kind == 'leaf':
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.14, segments=40, ring_count=20, location=(0, y, z))
        lf = bpy.context.object; lf.name = 'leaf'; lf.scale = (0.55, 0.3, 1.25); lf.rotation_euler = (0, math.radians(-38), 0)
        for v in lf.data.vertices:
            v.co.x *= (1 - 0.55 * abs(v.co.z) / 0.14)   # taper both ends to points
        smooth(lf); lf.data.materials.append(g); link(lf, coll)
        line('stem', (-0.10, y, z-0.12), (-0.15, y, z-0.18), col, coll, 0.016)
    elif kind == 'bars':
        for i, h in enumerate((0.08, 0.14, 0.22)):
            rbox('bar', (0.06, 0.04, h), (-0.1 + i*0.1, y, z - 0.1 + h/2), 0.015, g, coll, segs=3)
    elif kind == 'paw':
        sphere('pad', 0.09, (0, y, z-0.05), scale=(1.1,0.5,0.9), m=g, coll=coll)
        for x, zz in ((-0.11, 0.06), (-0.04, 0.12), (0.04, 0.12), (0.11, 0.06)):
            sphere('toe', 0.04, (x, y, z+zz), scale=(1,0.5,1.2), m=g, coll=coll)
    elif kind == 'recycle':
        R = 0.12
        for i in range(3):
            a0 = math.radians(90 + i*120 + 18); a1 = math.radians(90 + i*120 + 100)
            for k in range(12):
                a = a0 + (a1 - a0) * k / 11
                sphere('rc', 0.022, (R*math.cos(a), y, z + R*math.sin(a)), scale=(1, 0.5, 1), m=g, coll=coll)
            tip = (R*math.cos(a1), y, z + R*math.sin(a1))
            # cone axis (+Z) turned to the counter-clockwise tangent (-sin a1, cos a1) in the XZ plane
            bpy.ops.mesh.primitive_cone_add(radius1=0.055, radius2=0.0, depth=0.08, vertices=24, location=tip, rotation=(0, -a1, 0))
            ob = bpy.context.object; ob.name = 'rc_head'; ob.scale = (1, 0.45, 1); smooth(ob); ob.data.materials.append(g); link(ob, coll)
    elif kind == 'bolt':
        line('b', (-0.02, y, z+0.16), (-0.08, y, z-0.01), col, coll, 0.03)
        line('b', (-0.08, y, z-0.01), (0.04, y, z-0.01), col, coll, 0.03)
        line('b', (0.04, y, z-0.01), (-0.02, y, z-0.17), col, coll, 0.03)

# ---- tools, held in the right hand (viewer's right: +x)
HAND_R = Vector((1.05, -0.50, 1.00))
def build_tool(kind, col, coll):
    h = HAND_R; mm = metal_mat(); dk = dark_mat(); acc = accent_mat(col)
    before = set(bpy.data.objects)
    _tool(kind, h, mm, dk, acc, col, coll)
    # scale every new part about the grip so carried items read at avatar size
    for ob in set(bpy.data.objects) - before:
        ob.location = h + (ob.location - h) * 1.55
        ob.scale = tuple(c * 1.55 for c in ob.scale)

def _tool(kind, h, mm, dk, acc, col, coll):
    if kind == 'wrench':
        cyl('w_shaft', 0.045, 0.7, h + Vector((0.05, -0.1, 0.3)), mm, coll, rot=(0.0, 0.25, 0))
        torus('w_head', 0.11, 0.05, h + Vector((0.15, -0.1, 0.66)), mm, coll, rot=(math.pi/2, 0, 0.25))
    elif kind == 'claw':
        cyl('c_shaft', 0.05, 0.4, h + Vector((0.1, -0.15, 0.25)), mm, coll, rot=(0, 0.4, 0))
        for sx in (-1, 1):
            cyl('c_jaw', 0.03, 0.3, h + Vector((0.2 + sx*0.1, -0.2, 0.5)), dk, coll, rot=(0, sx*0.6, 0))
    elif kind == 'drill':
        rbox('d_body', (0.3, 0.2, 0.22), h + Vector((0.1, -0.25, 0.22)), 0.05, mat('yellow', base=(0.95,0.75,0.15), rough=0.4), coll)
        cyl('d_bit', 0.03, 0.3, h + Vector((0.35, -0.25, 0.22)), mm, coll, rot=(0, math.pi/2, 0))
        rbox('d_grip', (0.12, 0.14, 0.2), h + Vector((0.05, -0.25, 0.04)), 0.03, dk, coll)
    elif kind == 'flashlight':
        cyl('f_body', 0.06, 0.4, h + Vector((0.1, -0.2, 0.25)), dk, coll, rot=(0, 1.2, 0))
        cyl('f_head', 0.09, 0.1, h + Vector((0.32, -0.2, 0.33)), mm, coll, rot=(0, 1.2, 0))
        cyl('f_lens', 0.075, 0.03, h + Vector((0.37, -0.2, 0.35)), mat('beam', base=(1,0.95,0.7), emit=(1,0.95,0.7), strength=2.5), coll, rot=(0, 1.2, 0))
    elif kind == 'magnet':
        red = mat('red', base=(0.8,0.15,0.12), rough=0.4)
        torus('m_u', 0.14, 0.05, h + Vector((0.12, -0.2, 0.35)), red, coll, rot=(math.pi/2, 0, 0))
        rbox('m_cut', (0.4, 0.3, 0.2), h + Vector((0.12, -0.2, 0.17)), 0.01, mat('cutter', base=(0,0,0), alpha=0), coll)
        for sx in (-1, 1):
            cyl('m_tip', 0.05, 0.1, h + Vector((0.12 + sx*0.14, -0.2, 0.22)), mat('silver', base=(0.85,0.87,0.9), metal=1, rough=0.3), coll)
    elif kind == 'camera':
        rbox('cam_body', (0.3, 0.18, 0.22), h + Vector((0.12, -0.2, 0.3)), 0.04, dk, coll)
        cyl('cam_lens', 0.08, 0.12, h + Vector((0.12, -0.32, 0.3)), mm, coll, rot=(math.pi/2, 0, 0))
        cyl('cam_glass', 0.06, 0.02, h + Vector((0.12, -0.39, 0.3)), glass_mat(), coll, rot=(math.pi/2, 0, 0))
        sphere('cam_led', 0.025, h + Vector((0.22, -0.3, 0.38)), m=mat('red_led', base=(1,0.2,0.2), emit=(1,0.2,0.2), strength=2), coll=coll)

# ---- back accessories (rendered behind the body)
def build_back(kind, col, coll):
    acc = accent_mat(col)
    if kind == 'backpack':
        rbox('bp', (1.95, 0.55, 1.05), BODY_C + Vector((0, 0.60, 0.32)), 0.24, acc, coll)
        for sx in (-1, 1):
            rbox('bp_pocket', (0.34, 0.28, 0.46), BODY_C + Vector((sx*0.84, 0.40, 0.0)), 0.09, shell_shade_mat(), coll)
            capsule('strap', 0.05, 0, (sx*0.36, 0.05, 1.12), (sx*0.40, -0.44, 0.78), m=dark_mat(), coll=coll)
    elif kind == 'jetpack':
        for sx in (-1, 1):
            cyl('jet', 0.17, 1.05, BODY_C + Vector((sx*1.02, 0.40, 0.30)), metal_mat(), coll)
            cyl('jet_cap', 0.20, 0.10, BODY_C + Vector((sx*1.02, 0.40, 0.86)), accent_mat(col), coll)
            sphere('jet_tip', 0.11, BODY_C + Vector((sx*1.02, 0.40, 0.93)), m=glow_mat(col, 2.0), coll=coll)
            bpy.ops.mesh.primitive_cone_add(radius1=0.15, radius2=0.02, depth=0.42, location=BODY_C + Vector((sx*1.02, 0.40, -0.44)), rotation=(math.pi, 0, 0))
            ob = bpy.context.object; ob.name = 'flame'; smooth(ob); ob.data.materials.append(glow_mat(col, 1.8)); link(ob, coll)
    elif kind == 'cape':
        rbox('cape', (1.5, 0.08, 1.9), BODY_C + Vector((0, 0.72, -0.25)), 0.2, mat('capem', base=(0.4,0.25,0.65), rough=0.7), coll, rot=(0.12, 0, 0))
        torus('cape_tie', 0.5, 0.035, (0, 0.1, 1.1), mat('capem', base=(0.4,0.25,0.65), rough=0.7), coll)
    elif kind == 'satchel':
        rbox('sat', (0.6, 0.35, 0.5), BODY_C + Vector((0.65, 0.3, -0.3)), 0.1, mat('leather2', base=(0.45,0.28,0.15), rough=0.6), coll)
        capsule('sat_strap', 0.035, 0, (-0.5, -0.1, 1.05), (0.7, 0.3, -0.1), m=mat('leather2', base=(0.45,0.28,0.15), rough=0.6), coll=coll)
    elif kind == 'scarf':
        knit = mat('knit', base=(0.95,0.5,0.6), rough=0.95)
        torus('scarf', 0.42, 0.13, (0, 0.0, 1.06), knit, coll)
        rbox('scarf_tail', (0.20, 0.10, 0.48), (0.24, -0.47, 0.84), 0.06, knit, coll, rot=(0, 0.18, 0))
    elif kind == 'bow':
        for sx in (-1, 1):
            sphere('bow', 0.15, (sx*0.19, -0.46, 1.05), scale=(1.35, 0.55, 0.85), m=mat('bowm', base=(0.7,0.45,0.9), rough=0.5), coll=coll)
        sphere('bow_knot', 0.085, (0, -0.52, 1.05), m=mat('bowm2', base=(0.55,0.35,0.75), rough=0.5), coll=coll)

# ------------------------------------------------------------------ scene
def setup_scene(res=(768, 960), samples=64, head_cam=False):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    _mats.clear()
    sc = bpy.context.scene
    try:
        bpy.ops.preferences.addon_enable(module='cycles')
    except Exception:
        pass
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = samples
    sc.cycles.use_denoising = True
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.film_transparent = True
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGBA'
    sc.view_settings.view_transform = 'Khronos PBR Neutral'
    sc.view_settings.exposure = -0.15
    # world: soft gray studio light
    w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
    bg = w.node_tree.nodes['Background']; bg.inputs[0].default_value = (0.82, 0.85, 0.90, 1); bg.inputs[1].default_value = 0.45
    # lights
    def area(name, loc, rot, energy, size, color=(1,1,1)):
        d = bpy.data.lights.new(name, 'AREA'); d.energy = energy; d.size = size; d.color = color
        o = bpy.data.objects.new(name, d); sc.collection.objects.link(o); o.location = loc; o.rotation_euler = rot
        return o
    area('key', (2.5, -3.5, 4.0), (0.95, 0.15, 0.6), 260, 3.0, (1, 0.97, 0.93))
    area('fill', (-3.5, -3.0, 2.0), (1.2, -0.2, -0.9), 90, 4.0, (0.9, 0.95, 1))
    area('rim', (0.5, 3.5, 3.0), (-1.0, 0.1, 0.1), 220, 3.0, (0.85, 0.95, 1))
    # camera
    cd = bpy.data.cameras.new('cam'); cd.lens = 55
    cam = bpy.data.objects.new('cam', cd); sc.collection.objects.link(cam); sc.camera = cam
    if head_cam:
        cam.location = (0, -4.6, 1.75); cam.rotation_euler = (math.radians(89), 0, 0); cd.lens = 90
    else:
        cam.location = (0, -6.4, 1.9); cam.rotation_euler = (math.radians(82), 0, 0)
    return sc

def hide_all_but(coll_names):
    for c in bpy.context.scene.collection.children:
        on = c.name in coll_names
        c.hide_render = not on
        c.hide_viewport = not on

def render(path):
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
