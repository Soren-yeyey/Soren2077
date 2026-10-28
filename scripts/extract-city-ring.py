"""Extract the existing Blender ring from the game GLB without changing its mesh or texture."""
import copy
import hashlib
import json
from pathlib import Path
import struct

ROOT = Path(__file__).resolve().parents[1]
source = (ROOT / 'models/racing-world.glb').read_bytes()
json_size = struct.unpack_from('<I', source, 12)[0]
original = json.loads(source[20:20 + json_size])
binary = source[28 + json_size:]
chosen = [20]
nodes = []
mesh_ids = []
for number in chosen:
    node = next(n for n in original['nodes'] if n.get('extras', {}).get('asset_number') == number and n.get('extras', {}).get('role') == 'prop')
    mesh_ids.append(node['mesh'])
    nodes.append({'name': f'city-ring-{number:02}', 'mesh': len(mesh_ids) - 1,
                  'extras': copy.deepcopy(node['extras'])})
meshes = [copy.deepcopy(original['meshes'][i]) for i in mesh_ids]
accessor_ids = sorted({i for m in meshes for p in m['primitives'] for i in [*p['attributes'].values(), p['indices']]})
material_ids = sorted({p['material'] for m in meshes for p in m['primitives']})
materials = [copy.deepcopy(original['materials'][i]) for i in material_ids]

def texture_refs(value):
    if isinstance(value, dict):
        for key, item in value.items():
            if key.endswith('Texture') and isinstance(item, dict) and 'index' in item:
                yield item
            else:
                yield from texture_refs(item)
    elif isinstance(value, list):
        for item in value:
            yield from texture_refs(item)

texture_ids = sorted({r['index'] for r in texture_refs(materials)})
textures = [copy.deepcopy(original['textures'][i]) for i in texture_ids]
image_ids = sorted({t['source'] for t in textures})
sampler_ids = sorted({t['sampler'] for t in textures if 'sampler' in t})
accessors = [copy.deepcopy(original['accessors'][i]) for i in accessor_ids]
images = [copy.deepcopy(original['images'][i]) for i in image_ids]
view_ids = sorted({a['bufferView'] for a in accessors} | {i['bufferView'] for i in images})
maps = {key: {old: new for new, old in enumerate(ids)} for key, ids in
        [('accessors', accessor_ids), ('materials', material_ids), ('textures', texture_ids),
         ('images', image_ids), ('samplers', sampler_ids), ('views', view_ids)]}
for m in meshes:
    for p in m['primitives']:
        p['attributes'] = {s: maps['accessors'][i] for s, i in p['attributes'].items()}
        p['indices'] = maps['accessors'][p['indices']]
        p['material'] = maps['materials'][p['material']]
for r in texture_refs(materials):
    r['index'] = maps['textures'][r['index']]
for t in textures:
    t['source'] = maps['images'][t['source']]
    if 'sampler' in t:
        t['sampler'] = maps['samplers'][t['sampler']]
for item in accessors + images:
    item['bufferView'] = maps['views'][item['bufferView']]
payload = bytearray()
views = []
for i in view_ids:
    v = copy.deepcopy(original['bufferViews'][i])
    start = v.get('byteOffset', 0)
    while len(payload) % 4:
        payload.append(0)
    v['byteOffset'] = len(payload)
    v['buffer'] = 0
    payload.extend(binary[start:start + v['byteLength']])
    views.append(v)
doc = {'asset': {'version': '2.0', 'generator': 'Existing Blender ring subset; original payloads preserved'},
       'scene': 0, 'scenes': [{'nodes': list(range(len(nodes)))}], 'nodes': nodes,
       'meshes': meshes, 'accessors': accessors, 'materials': materials,
       'textures': textures, 'images': images,
       'samplers': [original['samplers'][i] for i in sampler_ids], 'bufferViews': views,
       'buffers': [{'byteLength': len(payload)}]}
for key in ['extensionsUsed', 'extensionsRequired']:
    if key in original:
        doc[key] = original[key]
encoded = json.dumps(doc, ensure_ascii=False, separators=(',', ':')).encode()
encoded += b' ' * (-len(encoded) % 4)
payload += b'\0' * (-len(payload) % 4)
out = struct.pack('<III', 0x46546C67, 2, 28 + len(encoded) + len(payload))
out += struct.pack('<II', len(encoded), 0x4E4F534A) + encoded
out += struct.pack('<II', len(payload), 0x004E4942) + payload
target = ROOT / 'models/city-ring.glb'
target.write_bytes(out)
manifest_path = ROOT / 'data/assets.json'
manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
manifest['files']['models/city-ring.glb'] = {'bytes': len(out), 'sha256': hashlib.sha256(out).hexdigest()}
manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'assets': chosen, 'bytes': len(out), 'sourceSha256': hashlib.sha256(source).hexdigest(),
                  'payloadsPreserved': True, 'triangles': sum(doc['accessors'][p['indices']]['count'] // 3 for m in meshes for p in m['primitives'])}))
