window.CityMaterials=function(T){
 const make=(color,metalness=.2,roughness=.65)=>new T.MeshStandardMaterial({color,metalness,roughness});
 const glow=color=>new T.MeshStandardMaterial({color,emissive:color,emissiveIntensity:2.1,roughness:.35});
 return{road:make(0x17232b,.6,.27),walk:make(0x36414a,.25,.6),edge:make(0x71818b,.65,.35),steel:make(0x172833,.65,.3),dark:make(0x060e16,.3,.55),cyan:glow(0x62e5ff),amber:glow(0xffb65f),pink:glow(0xfa5bad),cloth:make(0x507c87,0,.8),skin:make(0xa97760,0,.7)};
};
