"""Repack PNG losslessly, or optional JPEG at WebP 90, without changing geometry."""
import hashlib
import io
import json
import struct
import sys
from pathlib import Path
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]


def repack(path, apply=False, jpeg=False):
    raw=path.read_bytes();length=struct.unpack_from('<I',raw,12)[0]
    doc=json.loads(raw[20:20+length]);binary=raw[28+length:]
    replacements={};converted=set();evidence=[]
    for index,image in enumerate(doc.get('images',[])):
        if 'bufferView' not in image:continue
        view=doc['bufferViews'][image['bufferView']];start=view.get('byteOffset',0)
        if view.get('buffer',0)!=0:continue
        original=binary[start:start+view['byteLength']];bitmap=Image.open(io.BytesIO(original))
        if bitmap.format!='PNG' and not (jpeg and bitmap.format=='JPEG'):continue
        pixels=bitmap.convert('RGBA' if 'A' in bitmap.mode else 'RGB');out=io.BytesIO()
        lossless=bitmap.format=='PNG'
        pixels.save(out,'WEBP',lossless=lossless,exact=True,quality=90,method=6)
        encoded=out.getvalue()
        if lossless:assert Image.open(io.BytesIO(encoded)).convert(pixels.mode).tobytes()==pixels.tobytes()
        if len(encoded)>=len(original):continue
        replacements[image['bufferView']]=encoded;converted.add(index);image['mimeType']='image/webp'
        evidence.append({'image':image.get('name',str(index)),'size':list(pixels.size),'decodedPixelsIdentical':lossless,'webpQuality':100 if lossless else 90,'before':len(original),'after':len(encoded)})
    if not converted:return {'file':path.name,'saved':0}
    for texture in doc.get('textures',[]):
        if texture.get('source') in converted:
            texture.setdefault('extensions',{})['EXT_texture_webp']={'source':texture.pop('source')}
    for key in ['extensionsUsed','extensionsRequired']:
        doc[key]=list(dict.fromkeys(doc.get(key,[])+['EXT_texture_webp']))
    output=bytearray();geometry_before=hashlib.sha256();geometry_after=hashlib.sha256()
    for index,view in enumerate(doc['bufferViews']):
        if view.get('buffer',0)!=0:continue
        start=view.get('byteOffset',0);original=binary[start:start+view['byteLength']]
        payload=replacements.get(index,original)
        if index not in replacements:geometry_before.update(original);geometry_after.update(payload)
        output+=b'\0'*(-len(output)%4);view['byteOffset']=len(output);view['byteLength']=len(payload);output+=payload
    assert geometry_before.digest()==geometry_after.digest()
    doc['buffers'][0]['byteLength']=len(output)
    encoded=json.dumps(doc,ensure_ascii=False,separators=(',',':')).encode();encoded+=b' '*(-len(encoded)%4);output+=b'\0'*(-len(output)%4)
    packed=struct.pack('<III',0x46546C67,2,28+len(encoded)+len(output))+struct.pack('<II',len(encoded),0x4E4F534A)+encoded+struct.pack('<II',len(output),0x004E4942)+output
    result={'file':path.name,'saved':len(raw)-len(packed),'geometryUVAndIndicesIdentical':True,'images':evidence}
    if apply:
        backup=ROOT.parent/'city-studio/assets/integration-source-backup';backup.mkdir(exist_ok=True)
        target=backup/path.name
        if not target.exists():target.write_bytes(raw)
        path.write_bytes(packed)
    return result


if __name__=='__main__':
    apply='--apply' in sys.argv
    names=['floating-city.glb','neon-facade.glb','billboard-tower.glb'] if '--jpeg' in sys.argv else ['yuheng-preview.glb','yuheng-drive.glb']
    results=[repack(ROOT/'models'/name,apply,'--jpeg' in sys.argv) for name in names]
    if apply:
        p=ROOT/('reports/texture-optimization-jpeg.json' if '--jpeg' in sys.argv else 'reports/texture-optimization.json');p.write_text(json.dumps(results,indent=2)+'\n')
    print(json.dumps(results))
