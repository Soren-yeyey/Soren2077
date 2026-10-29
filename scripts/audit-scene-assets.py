"""Read-only inventory of runtime resources and local Blender/Tripo deliveries."""
import hashlib
import io
import json
import struct
from collections import Counter
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
WORKSPACE = ROOT.parent


def read_model(path):
    raw = path.read_bytes()
    binary = b''
    if path.suffix.lower() == '.glb':
        magic, version, length = struct.unpack_from('<III', raw)
        assert magic == 0x46546C67 and version == 2 and length == len(raw)
        size = struct.unpack_from('<I', raw, 12)[0]
        doc = json.loads(raw[20:20 + size])
        binary = raw[28 + size:]
    else:
        doc = json.loads(raw)
    issues, images, materials = [], [], []
    for image in doc.get('images', []):
        item = {'name': image.get('name'), 'uri': image.get('uri'), 'embedded': 'bufferView' in image}
        try:
            if 'bufferView' in image:
                view = doc['bufferViews'][image['bufferView']]
                offset = view.get('byteOffset', 0)
                buffer = doc['buffers'][view.get('buffer', 0)]
                if 'uri' in buffer:
                    item.update(embedded=False, buffer=buffer['uri'])
                data = (path.parent / buffer['uri']).read_bytes() if 'uri' in buffer else binary
                payload = data[offset:offset + view['byteLength']]
            elif image.get('uri', '').startswith('data:'):
                import base64
                payload = base64.b64decode(image['uri'].split(',', 1)[1])
            else:
                target = path.parent / image['uri']
                assert target.exists(), 'Missing image: ' + image['uri']
                assert target.name in [p.name for p in target.parent.iterdir()], 'Image path case mismatch'
                payload = target.read_bytes()
            bitmap = Image.open(io.BytesIO(payload))
            item.update(size=list(bitmap.size), format=bitmap.format, bytes=len(payload))
        except Exception as error:
            issues.append(str(error))
        images.append(item)
    for material in doc.get('materials', []):
        pbr = material.get('pbrMetallicRoughness', {})
        channels = {}
        for name, value in [('baseColor', pbr.get('baseColorTexture')), ('normal', material.get('normalTexture')),
                            ('metallicRoughness', pbr.get('metallicRoughnessTexture')),
                            ('emissive', material.get('emissiveTexture')), ('occlusion', material.get('occlusionTexture'))]:
            if value:
                try:
                    texture = doc['textures'][value['index']]
                    index = texture.get('source', texture.get('extensions', {}).get('EXT_texture_webp', {}).get('source'))
                    assert index is not None and index < len(images), 'Invalid image binding'
                    channels[name] = index
                except Exception as error:
                    issues.append(material.get('name', '') + ': ' + str(error))
        materials.append({'name': material.get('name'), 'channels': channels,
                          'baseColorFactor': pbr.get('baseColorFactor', [1, 1, 1, 1]),
                          'roughness': pbr.get('roughnessFactor', 1), 'metallic': pbr.get('metallicFactor', 1),
                          'alphaMode': material.get('alphaMode', 'OPAQUE')})
    triangles = 0
    for mesh in doc.get('meshes', []):
        for primitive in mesh['primitives']:
            accessor = doc['accessors'][primitive.get('indices', primitive['attributes']['POSITION'])]
            if primitive.get('mode', 4) == 4:
                triangles += accessor['count'] // 3
            if 'TEXCOORD_0' not in primitive['attributes'] and 'material' in primitive:
                if materials[primitive['material']]['channels']:
                    issues.append('Textured mesh without UV: ' + mesh.get('name', ''))
    for buffer in doc.get('buffers', []):
        uri = buffer.get('uri')
        if uri and not uri.startswith('data:') and not (path.parent / uri).exists():
            issues.append('Missing buffer: ' + uri)
    return {'meshes': len(doc.get('meshes', [])), 'nodes': len(doc.get('nodes', [])),
            'trianglesUniqueGeometry': triangles, 'animations': len(doc.get('animations', [])),
            'skins': len(doc.get('skins', [])), 'images': images, 'materials': materials,
            'issues': sorted(set(issues)), 'sceneMetadata': doc.get('scenes', [{}])[0].get('extras', {}),
            'meshBoundsLocal': [{'name': mesh.get('name'), 'min': doc['accessors'][mesh['primitives'][0]['attributes']['POSITION']].get('min'),
                                'max': doc['accessors'][mesh['primitives'][0]['attributes']['POSITION']].get('max')}
                               for mesh in doc.get('meshes', [])]}


def main():
    records = []
    roots = [ROOT / 'models', WORKSPACE / 'city-studio', WORKSPACE / 'cyberpunk_model']
    for base in roots:
        for path in sorted(base.rglob('*')):
            if path.suffix.lower() not in {'.glb', '.gltf', '.blend', '.mp3', '.wav', '.ogg', '.fbx', '.obj'}:
                continue
            rel = path.relative_to(WORKSPACE).as_posix()
            record = {'path': rel, 'format': path.suffix[1:], 'bytes': path.stat().st_size,
                      'runtime': path.is_relative_to(ROOT), 'category': 'source'}
            if record['runtime']:
                record['sha256'] = hashlib.sha256(path.read_bytes()).hexdigest()
                record['category'] = 'character' if 'operative' in path.name else 'vehicle' if any(k in path.name for k in ['vehicle', 'yuheng']) else 'environment' if 'environment' in path.name else 'building-or-prop'
            if path.suffix.lower() in {'.glb', '.gltf'}:
                try:
                    record.update(read_model(path))
                    record['optimization'] = 'review' if record['trianglesUniqueGeometry'] > 300000 or record['bytes'] > 20000000 else 'web-candidate'
                except Exception as error:
                    record['issues'] = [str(error)]
            records.append(record)
    runtime_bytes = sum(p.stat().st_size for folder in ['models', 'images'] for p in (ROOT / folder).rglob('*') if p.is_file())
    report = {'runtimeBytes': runtime_bytes, 'budgetBytes': None, 'records': records,
              'counts': dict(Counter(r['format'] for r in records)),
              'runtimeIssues': [{'path': r['path'], 'issues': r['issues']} for r in records if r['runtime'] and r.get('issues')]}
    target = ROOT / 'reports/asset-scene-audit.json'
    target.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({k: v for k, v in report.items() if k != 'records'}, ensure_ascii=False))


if __name__ == '__main__':
    main()
