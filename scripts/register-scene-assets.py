"""Refresh the existing v2 file manifest without changing asset approvals."""
import hashlib
import json
from pathlib import Path

root=Path(__file__).resolve().parents[1]
path=root/'data/assets.json'
manifest=json.loads(path.read_text(encoding='utf-8'))
files=set(manifest['files'])|{'data/city-scenes.json'}
files.update(p.relative_to(root).as_posix() for folder in ['models','images'] for p in (root/folder).rglob('*') if p.is_file())
for name in sorted(files):
    content=(root/name).read_bytes()
    manifest['files'][name]={'bytes':len(content),'sha256':hashlib.sha256(content).hexdigest()}
path.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'files':len(files),'assetApprovalsPreserved':True}))
