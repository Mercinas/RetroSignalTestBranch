import bpy, bmesh, math, json, os, sys
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view

ROOT=os.path.dirname(os.path.abspath(__file__))
os.environ['OPTIX_CACHE_PATH']=os.path.join(ROOT,'optix-cache');os.makedirs(os.environ['OPTIX_CACHE_PATH'],exist_ok=True)
FINAL='--final' in sys.argv
SIZE=3072 if FINAL else 1024
OUT=os.path.join(ROOT,'master' if FINAL else 'draft')
os.makedirs(OUT,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene
scene.render.engine='CYCLES';scene.cycles.samples=48 if FINAL else 24
scene.cycles.use_denoising=True
preferences=bpy.context.preferences.addons['cycles'].preferences
preferences.compute_device_type='OPTIX';preferences.get_devices()
if any(device.type=='OPTIX' for device in preferences.devices):
 for device in preferences.devices:device.use=device.type=='OPTIX'
 scene.cycles.device='GPU'
scene.render.resolution_x=SIZE;scene.render.resolution_y=SIZE;scene.render.resolution_percentage=100
scene.render.film_transparent=True
scene.view_settings.view_transform='AgX'
scene.view_settings.exposure=.65
scene.world.color=(.04,.04,.04)
LAYERS={'shell':1,'recesses':2,'buttons':3,'stick':4,'markings':5,'cable':6,'shadow':7}
collections={}
for name in LAYERS:
 c=bpy.data.collections.new(name);scene.collection.children.link(c);collections[name]=c
def assign(obj,name,mat,layer):
 obj.name=name
 for c in list(obj.users_collection):c.objects.unlink(obj)
 collections[layer].objects.link(obj);obj.pass_index=LAYERS[layer]
 if mat:obj.data.materials.append(mat)
 return obj
def normals(mesh):
 bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.triangulate(bm,faces=[f for f in bm.faces if len(f.verts)>4]);bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(mesh);bm.free()
def material(name,color,rough=.4,grain=False):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
 n=m.node_tree.nodes;p=n.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=rough
 if grain:
  noise=n.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=160;noise.inputs['Detail'].default_value=2
  tex=n.new('ShaderNodeTexCoord');m.node_tree.links.new(tex.outputs['Generated'],noise.inputs['Vector'])
  bump=n.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.14;bump.inputs['Distance'].default_value=.065
  m.node_tree.links.new(noise.outputs['Fac'],bump.inputs['Height']);m.node_tree.links.new(bump.outputs['Normal'],p.inputs['Normal'])
 return m
shellmat=material('warm grey textured ABS',(.48,.485,.48),.4,True)
seammat=material('lower shell grey',(.31,.32,.325),.43,True)
wellmat=material('recess grey',(.36,.375,.38),.47,True)
rubber=material('charcoal rubber',(.055,.06,.065),.48,True)
socket=material('graphite socket',(.09,.10,.115),.34,True)
stickmat=material('ivory stick cap',(.59,.60,.56),.4,True)
blue=material('blue molded ABS',(.012,.12,.48),.24)
green=material('green molded ABS',(.012,.36,.12),.24)
yellow=material('yellow molded ABS',(.94,.61,.012),.24)
red=material('red molded ABS',(.61,.018,.023),.24)
darkred=material('red raised lettering',(.49,.016,.02),.3)
darkblue=material('blue raised lettering',(.018,.075,.29),.3)
darkgreen=material('green raised lettering',(.025,.24,.095),.3)
darkyellow=material('yellow raised arrows',(.8,.48,.012),.3)

# Pixel coordinates measured from the staged original orthographic photograph.
# Reference bounds are 1592 by 1568; a shared camera projection creates hit regions.
def xy(point):return ((point[0]-796)/8.85,(784-point[1])/8.85)
outline=[(510,123),(645,78),(797,66),(950,80),(1085,123),(1110,184),(1318,218),(1432,280),(1505,380),(1522,521),(1543,687),(1550,875),(1531,1052),(1487,1184),(1436,1228),(1380,1220),(1340,1160),(1290,976),(1266,850),(1228,808),(1138,814),(1070,832),(1030,899),(990,1070),(950,1302),(905,1448),(852,1526),(799,1544),(744,1530),(690,1461),(647,1323),(606,1100),(570,921),(531,853),(464,817),(377,808),(335,835),(298,960),(248,1143),(208,1212),(158,1231),(108,1210),(65,1123),(40,980),(36,804),(53,628),(72,505),(78,404),(128,308),(209,247),(340,213),(485,184)]
def smooth(points,steps=5):
 result=[]
 for i,b in enumerate(points):
  a=Vector(points[(i-1)%len(points)]);b=Vector(b);c=Vector(points[(i+1)%len(points)]);d=Vector(points[(i+2)%len(points)])
  for j in range(steps):
   t=j/steps;v=.5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t);result.append(tuple(v))
 return result
contour=smooth([xy(p) for p in outline])
def inset(points,distance):
 # Right-hand normals point inward for this clockwise world-space contour.
 output=[]
 for i,p in enumerate(points):
  prev=Vector(points[(i-1)%len(points)]);nxt=Vector(points[(i+1)%len(points)]);t=(nxt-prev).normalized();normal=Vector((t.y,-t.x))
  a=Vector(p)-prev;b=nxt-Vector(p);angle=a.angle(b) if a.length and b.length else 0
  radius=(a.length+b.length)/(2*max(math.sin(angle),.001))
  local=min(distance,radius*.3)
  output.append((p[0]+normal.x*local,p[1]+normal.y*local))
 return output
def shell(name,z,mat,layer):
 rings=[(0,0),(0,9)]
 verts=[];faces=[];N=len(contour)
 for offset,height in rings:
  verts.extend((x,y,z+height) for x,y in inset(contour,offset))
 for ring in range(len(rings)-1):
  for i in range(N):faces.append((ring*N+i,ring*N+(i+1)%N,(ring+1)*N+(i+1)%N,(ring+1)*N+i))
 faces.append(tuple(range((len(rings)-1)*N,len(rings)*N)))
 faces.append(tuple(reversed(range(N))))
 mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update();normals(mesh);obj=bpy.data.objects.new(name,mesh);collections[layer].objects.link(obj);obj.pass_index=LAYERS[layer];obj.data.materials.append(mat)
 for poly in mesh.polygons:poly.use_smooth=len(poly.vertices)==4
 remesh=obj.modifiers.new('continuous molded casing surface','REMESH');remesh.mode='VOXEL';remesh.voxel_size=.5;remesh.use_smooth_shade=True
 soften=obj.modifiers.new('soft ABS edge transitions','SMOOTH');soften.factor=1;soften.iterations=60
 return obj
shell('lower casing and visible seam',-.8,seammat,'shell')
shell('rounded ABS front shell',.2,shellmat,'shell')
def cylinder(name,point,radius,depth,z,mat,layer='buttons',vertices=96,bevel=.4):
 x,y=xy(point);bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=radius,depth=depth,location=(x,y,z))
 obj=assign(bpy.context.object,name,mat,layer)
 if bevel:
  m=obj.modifiers.new('molded edge radius','BEVEL');m.width=bevel;m.segments=4
  obj.modifiers.new('weighted normals','WEIGHTED_NORMAL')
 for p in obj.data.polygons:p.use_smooth=len(p.vertices)==4
 return obj
def torus(name,point,major,minor,z,mat,layer='recesses'):
 x,y=xy(point);bpy.ops.mesh.primitive_torus_add(major_radius=major,minor_radius=minor,major_segments=96,minor_segments=16,location=(x,y,z));o=assign(bpy.context.object,name,mat,layer)
 for p in o.data.polygons:p.use_smooth=True
 return o
def extrude(name,points,z,depth,mat,layer,bevel=.5):
 verts=[(*p,z) for p in points]+[(*p,z+depth) for p in points];N=len(points)
 faces=[tuple(reversed(range(N))),tuple(range(N,2*N))]+[(i,(i+1)%N,(i+1)%N+N,i+N) for i in range(N)]
 mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update();normals(mesh);obj=bpy.data.objects.new(name,mesh);collections[layer].objects.link(obj);obj.pass_index=LAYERS[layer];obj.data.materials.append(mat)
 if bevel:
  m=obj.modifiers.new('soft molded corners','BEVEL');m.width=bevel;m.segments=4;obj.modifiers.new('surface normals','WEIGHTED_NORMAL')
 return obj
def lettering(name,label,point,z,size,mat):
 x,y=xy(point);curve=bpy.data.curves.new(name,'FONT');curve.body=label;curve.align_x='CENTER';curve.align_y='CENTER';curve.size=size;curve.extrude=.06;curve.bevel_depth=.035;curve.bevel_resolution=2
 obj=bpy.data.objects.new(name,curve);collections['markings'].objects.link(obj);obj.location=(x,y,z);obj.pass_index=5;curve.materials.append(mat)
def arrow(point,angle,z,mat,size=2.3,anchor=None):
 x,y=xy(point);points=[]
 for px,py in [(-size,-size*.6),(size,-size*.6),(0,size)]:points.append((x+px*math.cos(angle)-py*math.sin(angle),y+px*math.sin(angle)+py*math.cos(angle)))
 obj=extrude('molded direction arrow',points,z,.10,mat,'markings',.16)
 if anchor:obj['surface_anchor']=xy(anchor)
 return obj

dp=(326,520)
cylinder('D-pad recessed surround',dp,18.2,.35,5.02,wellmat,'recesses',bevel=.25)
x,y=xy(dp);a=4.8;b=12.7
cross=[(-a,b),(a,b),(a,a),(b,a),(b,-a),(a,-a),(a,-b),(-a,-b),(-a,-a),(-b,-a),(-b,a),(-a,a)]
extrude('D-pad socket',[(x+u*1.08,y+v*1.08) for u,v in cross],5.05,.65,socket,'recesses',1.4)
extrude('rubber cross',[(x+u,y+v) for u,v in cross],5.7,2.2,rubber,'buttons',1.1)
cylinder('D-pad center dimple',dp,2.35,.12,7.86,material('dimple',(.043,.047,.052),.55),'buttons',bevel=.08)
for p,angle in [((326,437),0),((326,600),math.pi),((246,520),math.pi/2),((408,520),-math.pi/2)]:arrow(p,angle,7.91,wellmat,2.2,dp)

for name,point,radius,mat,label,labelmat in [('A',(1184,656),6.55,blue,'A',darkblue),('B',(1090,547),6.55,green,'B',darkgreen),('Start',(801,560),5.9,red,'START',darkred)]:
 cylinder(name+' socket',point,radius+.65,.4,5.2,socket,'recesses',bevel=.2)
 cylinder(name+' cap',point,radius,2.45,6.55,mat,bevel=.65)
 lettering(name+' raised lettering',label,point,7.82,3.1 if name!='Start' else 2.1,labelmat)
for name,p,angle in [('C up',(1312,375),0),('C down',(1312,548),math.pi),('C left',(1220,463),math.pi/2),('C right',(1402,463),-math.pi/2)]:
 cylinder(name+' socket',p,5.65,.4,5.2,socket,'recesses',bevel=.2)
 cylinder(name+' cap',p,5,2.7,6.65,yellow,bevel=.65);arrow(p,angle,8.04,darkyellow,2.85)
torus('C group molded recess',(1312,463),11.7,.18,5.05,wellmat)
lettering('C marking','C',(1312,463),5.15,5,wellmat)

stick=(810,851)
cylinder('analog circular inset',stick,18,1,5.12,wellmat,'recesses',bevel=.55)
cylinder('octagonal analog gate',stick,11.5,1.8,6.1,socket,'recesses',vertices=8,bevel=.6)
cylinder('stick stem',stick,3.5,7,8.6,stickmat,'stick',bevel=.3)
cylinder('analog cap',stick,7.1,2.1,12.5,stickmat,'stick',bevel=.6)
for radius in [2.4,3.45,4.5,5.55,6.5]:torus('concentric thumb grip',stick,radius,.13,13.56,stickmat,'stick')
cylinder('cap center aperture',stick,.62,.15,13.59,rubber,'stick',bevel=.08)

# Shoulder strips follow the casing's upper edge, rather than projecting as tabs.
for name,points in [('L',[(174,247),(181,223),(306,195),(475,177),(485,189),(320,216)]),('R',[(1110,187),(1119,175),(1300,200),(1413,235),(1417,257),(1288,227)])]:
 extrude(name+' shoulder',smooth([xy(p) for p in points],4),1.4,2.0,rubber,'buttons',.5)
curve=bpy.data.curves.new('cable','CURVE');curve.dimensions='3D';curve.bevel_depth=1.7;curve.bevel_resolution=5
spline=curve.splines.new('BEZIER');spline.bezier_points.add(2)
for p,coord in zip(spline.bezier_points,[(0,80,1),(-2,87,1),(-6,96,1)]):p.co=coord;p.handle_left_type='AUTO';p.handle_right_type='AUTO'
obj=bpy.data.objects.new('rubber cable',curve);collections['cable'].objects.link(obj);obj.pass_index=6;curve.materials.append(rubber)

# A molded shell has a crowned face, not a flat extruded plate. Apply the same
# height field to the fixtures so their seats remain flush with the casing.
def crown(x,y):return 3*math.exp(-((x/65)**2+(y/95)**2))
for obj in collections['shell'].objects:
 bpy.context.view_layer.objects.active=obj
 for modifier in list(obj.modifiers):bpy.ops.object.modifier_apply(modifier=modifier.name)
 for vertex in obj.data.vertices:
  weight=max(0,min(1,(vertex.co.z+.8)/9))
  vertex.co.z+=crown(vertex.co.x,vertex.co.y)*weight
for layer in ['recesses','buttons','stick','markings']:
 for obj in collections[layer].objects:
  if obj.type=='MESH':
   center=sum((v.co for v in obj.data.vertices),Vector())/len(obj.data.vertices)+obj.location
  else:center=obj.location
  anchor=obj.get('surface_anchor',(center.x,center.y))
  height=crown(anchor[0],anchor[1])
  if layer=='recesses' and obj.type=='MESH':
   for vertex in obj.data.vertices:vertex.co.z+=crown(vertex.co.x+obj.location.x,vertex.co.y+obj.location.y)-height
  obj.location.z+=4.2+height

bpy.ops.mesh.primitive_plane_add(size=500,location=(0,0,-1.15));plane=assign(bpy.context.object,'contact shadow catcher',material('ground',(.28,.3,.34),.8),'shadow');plane.is_shadow_catcher=True
def light(name,loc,power,size):
 data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size
 obj=bpy.data.objects.new(name,data);scene.collection.objects.link(obj);obj.location=loc;obj.rotation_euler=(Vector((0,0,0))-obj.location).to_track_quat('-Z','Y').to_euler()
light('large softbox upper left',(-120,120,150),180000,95)
light('broad gentle fill',(110,-20,140),38000,130)
light('edge softbox',(-20,-130,100),26000,90)
camdata=bpy.data.cameras.new('orthographic reference camera');camera=bpy.data.objects.new('orthographic reference camera',camdata);scene.collection.objects.link(camera);camera.location=(0,0,320);camera.rotation_euler=(0,0,0);camera.rotation_euler=(Vector((0,0,0))-camera.location).to_track_quat('-Z','Y').to_euler();camdata.type='ORTHO';camdata.ortho_scale=190;scene.camera=camera
scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA';scene.render.image_settings.color_depth='8'
scene.render.filepath=os.path.join(OUT,'n64-beauty.png')

# Full beauty plus addressable visible-surface masks, rendered with all geometry
# present so every layer retains the same illumination and occlusion.
scene.view_layers[0].use_pass_object_index=True
scene.use_nodes=True
tree=bpy.data.node_groups.new('N64 layered outputs','CompositorNodeTree');scene.compositing_node_group=tree
render=tree.nodes.new('CompositorNodeRLayers')
render.scene=scene;render.layer=scene.view_layers[0].name
tree.interface.new_socket(name='Image',in_out='OUTPUT',socket_type='NodeSocketColor')
composite=tree.nodes.new('NodeGroupOutput');tree.links.new(render.outputs['Image'],composite.inputs['Image'])
for name,index in LAYERS.items():
 mask=tree.nodes.new('CompositorNodeIDMask');mask.inputs['Index'].default_value=index;mask.inputs['Anti-Alias'].default_value=True;tree.links.new(render.outputs['Object Index'],mask.inputs[0])
 alpha=tree.nodes.new('CompositorNodeSetAlpha');alpha.inputs['Type'].default_value='Apply Mask';tree.links.new(render.outputs['Image'],alpha.inputs['Image']);tree.links.new(mask.outputs[0],alpha.inputs['Alpha'])
 output=tree.nodes.new('CompositorNodeOutputFile');output.format.media_type=next(i.identifier for i in output.format.bl_rna.properties['media_type'].enum_items if 'IMAGE' in i.identifier and 'MULTI' not in i.identifier);output.format.file_format='PNG';output.format.color_mode='RGBA'
 output.file_output_items.new('RGBA',name)
 output.directory=OUT
 output.file_name=name
 tree.links.new(alpha.outputs[0],output.inputs[0])

positions={4:(326,437),5:(326,600),6:(246,520),7:(408,520),0:(1184,656),1:(1090,547),3:(801,560),23:(1312,375),22:(1312,548),21:(1220,463),20:(1402,463),19:(810,785),18:(810,917),17:(744,851),16:(876,851),10:(325,206),11:(1270,207)}
mapped={}
for index,p in positions.items():
 u,v,_=world_to_camera_view(scene,camera,Vector((*xy(p),6)))
 mapped[str(index)]={'u':u,'v':1-v}
with open(os.path.join(OUT,'coordinates.json'),'w') as file:json.dump({'resolution':SIZE,'layers':LAYERS,'controls':mapped,'reference':{'width':1592,'height':1568}},file,indent=2)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT,'n64-layered.blend'))
bpy.ops.render.render(write_still=True)
print('N64_LAYERED_RENDER_COMPLETE',OUT)
