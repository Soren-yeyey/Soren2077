"""Deduplicate identical GLB images in a glTF buffer sidecar; no texels change."""
import hashlib
import json
import struct
from collections import defaultdict
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
MODELS=ROOT/'models'


def read(path):
    raw=path.read_bytes();length=struct.unpack_from('<I',raw,12)[0]
    doc=json.loads(raw[20:20+length]);buffers=[raw[28+length:]]
    buffers.extend((path.parent/b['uri']).read_bytes() for b in doc['buffers'][1:])
    return doc,buffers,raw


def main():
    models={p:read(p) for p in sorted(MODELS.glob('*.glb'))};images=defaultdict(list)
    for path,(doc,buffers,raw) in models.items():
        for image in doc.get('images',[]):
            if 'bufferView' not in image:continue
            index=image['bufferView'];view=doc['bufferViews'][index];offset=view.get('byteOffset',0)
            payload=buffers[view.get('buffer',0)][offset:offset+view['byteLength']]
            images[hashlib.sha256(payload).hexdigest()].append((path,index,payload))
    common={h:items for h,items in images.items() if len({i[0] for i in items})>1}
    sidecar=bytearray();shared={}
    for digest,items in sorted(common.items()):
        sidecar+=b'\0'*(-len(sidecar)%4);offset=len(sidecar);payload=items[0][2];sidecar+=payload
        for path,index,_ in items:shared[path,index]=(offset,len(payload))
    backup=ROOT.parent/'city-studio/assets/integration-source-backup';backup.mkdir(exist_ok=True)
    results=[]
    for path,(doc,buffers,raw) in models.items():
        if not any(p==path for p,i in shared):continue
        if not (backup/path.name).exists():(backup/path.name).write_bytes(raw)
        geometry_views={a['bufferView'] for a in doc['accessors'] if 'bufferView' in a}
        binary=bytearray();before=hashlib.sha256();after=hashlib.sha256()
        for index,view in enumerate(doc['bufferViews']):
            offset=view.get('byteOffset',0);payload=buffers[view.get('buffer',0)][offset:offset+view['byteLength']]
            if (path,index) in shared:
                assert index not in geometry_views
                start,size=shared[path,index];view.update(buffer=1,byteOffset=start,byteLength=size)
            else:
                binary+=b'\0'*(-len(binary)%4);view.update(buffer=0,byteOffset=len(binary));binary+=payload
                before.update(payload);after.update(binary[view['byteOffset']:view['byteOffset']+view['byteLength']])
        assert before.digest()==after.digest()
        doc['buffers']=[{'byteLength':len(binary)},{'uri':'shared-textures.bin','byteLength':len(sidecar)}]
        encoded=json.dumps(doc,ensure_ascii=False,separators=(',',':')).encode();encoded+=b' '*(-len(encoded)%4);binary+=b'\0'*(-len(binary)%4)
        packed=struct.pack('<III',0x46546C67,2,28+len(encoded)+len(binary))+struct.pack('<II',len(encoded),0x4E4F534A)+encoded+struct.pack('<II',len(binary),0x004E4942)+binary
        path.write_bytes(packed);results.append({'file':path.name,'before':len(raw),'after':len(packed),'geometryAndImagePayloadsIdentical':True})
    (MODELS/'shared-textures.bin').write_bytes(sidecar)
    evidence={'sharedImagePayloads':len(common),'sidecarBytes':len(sidecar),'models':results}
    (ROOT/'reports/shared-textures.json').write_text(json.dumps(evidence,indent=2)+'\n')
    print(json.dumps(evidence))


if __name__=='__main__':main()
