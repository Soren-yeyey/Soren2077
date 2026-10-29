"""Run in the connected Blender; export copies, keeping the source scene intact."""
import bpy
import math
from pathlib import Path
from mathutils import Matrix

SOURCES={
 'mechanical-tower-detail':'35be03a5-ed71-4cda-a54d-ee6d02ececc1',
 'portrait-tower-detail':'ffbaa998-de3e-40e8-b45f-d5a3e34e7441',
 'commercial-island-detail':'3103dfdd-6f4e-4d62-be36-cee1646bea9c',
}


def export_asset(name):
    original_scene=bpy.context.window.scene
    original_active=bpy.context.view_layer.objects.active
    original_selected=list(bpy.context.selected_objects)
    source=bpy.data.objects[SOURCES[name]]
    source_faces=len(source.data.polygons)
    temp=bpy.data.scenes.new('temporary-detail-export')
    obj=source.copy();obj.data=source.data.copy();obj.name=name;temp.collection.objects.link(obj)
    try:
        bpy.context.window.scene=temp
        obj.matrix_world=Matrix.Identity(4);obj.rotation_euler=(math.pi/2,0,0)
        obj.select_set(True);bpy.context.view_layer.objects.active=obj
        modifier=obj.modifiers.new('web-detail-120k','DECIMATE');modifier.ratio=120000/source_faces
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        repaired=obj.data.validate(verbose=False,clean_customdata=False);obj.data.update()
        assert not obj.data.validate(verbose=False,clean_customdata=False)
        obj['source_id']=source.name;obj['source_faces']=source_faces;obj['quality']='source-detail-120k-4k'
        path=Path('E:/Codex-AIGM/Soren2077/models')/(name+'.glb')
        bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,use_active_scene=True,
          export_image_format='JPEG',export_jpeg_quality=95,export_image_quality=95,export_animations=False,export_extras=True)
        assert len(source.data.polygons)==source_faces
        return {'path':str(path),'triangles':sum(len(p.vertices)-2 for p in obj.data.polygons),'bytes':path.stat().st_size,
                'sourceId':source.name,'sourceUnchanged':True,'temporaryMeshRepaired':repaired,'uvLayers':len(obj.data.uv_layers)}
    finally:
        bpy.context.window.scene=original_scene
        mesh=obj.data;bpy.data.objects.remove(obj,do_unlink=True);bpy.data.meshes.remove(mesh);bpy.data.scenes.remove(temp)
        for selected in original_selected:selected.select_set(True)
        bpy.context.view_layer.objects.active=original_active
