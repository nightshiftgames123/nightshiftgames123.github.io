# Slices the source art into game-ready assets: cuts sprite-sheet frames, removes the black
# background, downscales to in-game size and packs atlases. Usage: python3 tools/build_assets.py
import sys, json, numpy as np
from PIL import Image
import os
HERE=os.path.dirname(os.path.abspath(__file__))
SRC=os.path.join(HERE,'source-art')
OUT=sys.argv[1] if len(sys.argv)>1 else os.path.join(HERE,'..','assets')
CX=[88+172*k for k in range(7)]
def sheet(src, bands, name, scales):
    im=np.asarray(Image.open(src).convert('RGB')).astype(np.float32)
    mx=im.max(axis=2)
    a=np.clip((mx-28)/(70-28),0,1)
    # un-blend black background so edges don't get dark halos
    rgb=np.where(a[...,None]>0, im/np.maximum(a[...,None],1e-3), 0).clip(0,255)
    rgba=np.dstack([rgb,a*255]).astype(np.uint8)
    full=Image.fromarray(rgba,'RGBA')
    # rows: (y0,y1, [cols]) ; anims named
    W=172; H=max(b[1]-b[0] for b in bands.values())
    frames=[]
    names={}
    for anim,(y0,y1,cols) in bands.items():
        names[anim]=[]
        for c in cols:
            x0=CX[c]-W//2
            cell=full.crop((x0,y1-H,x0+W,y1))
            names[anim].append(len(frames)); frames.append(cell)
    meta={}
    for s in scales:
        w=round(W*s); h=round(H*s)
        atlas=Image.new('RGBA',(w*len(frames),h))
        for i,fr in enumerate(frames):
            f=fr.resize((w,h),Image.LANCZOS)
            arr=np.asarray(f).copy()
            arr[...,3]=np.where(arr[...,3]>110,255,0); arr[arr[...,3]==0]=0
            atlas.paste(Image.fromarray(arr),(i*w,0))
        fn=f'{name}@{s}.png'
        atlas.save(f'{OUT}/{fn}',optimize=True)
        meta[str(s)]={'file':fn,'w':w,'h':h}
    return {'scales':meta,'anims':names}
meta={}
meta['goblin']=sheet(f'{SRC}/goblin-sheet.jpg',{
 'down':(25,185,[0,1,2,3,4,5]),'downAtk':(25,185,[6]),
 'up':(200,370,[0,1,2,3,4]),'upAtk':(200,370,[5]),
 'side':(395,565,[0,1,2,3,4]),'sideAtk':(395,565,[5,6]),
},'goblin',[0.25,0.5])
meta['ghost']=sheet(f'{SRC}/ghost-sheet.jpg',{
 'down':(10,185,[0,1,2,3,4,5]),'downAtk':(10,185,[6]),
 'up':(195,370,[0,1,2,3,4]),'upAtk':(195,370,[5]),
 'side':(400,560,[0,1,2,3,4,5]),'sideAtk':(400,560,[6]),
},'ghost',[0.25,0.5])
meta['wizard']=sheet(f'{SRC}/wizard-sheet.jpg',{
 'down':(5,186,[0,1,2,3,4,5]),'downAtk':(5,186,[6]),
 'up':(192,374,[0,1,2,3,4]),'upAtk':(192,374,[5]),
 'side':(382,565,[0,1,2,3,4,5]),'sideAtk':(382,565,[6]),
},'wizard',[0.25])
# crystal icon
c=Image.open(f'{SRC}/crystal.jpg').convert('RGB')
arr=np.asarray(c).astype(np.float32); a=np.clip((arr.max(axis=2)-25)/45,0,1)
rgb=np.where(a[...,None]>0,arr/np.maximum(a[...,None],1e-3),0).clip(0,255)
ci=Image.fromarray(np.dstack([rgb,a*255]).astype(np.uint8),'RGBA').crop((130,150,900,880))
for s in (16,32,96):
    r=np.asarray(ci.resize((s,s),Image.LANCZOS)).copy(); r[...,3]=np.where(r[...,3]>90,255,0); r[r[...,3]==0]=0
    Image.fromarray(r).save(f'{OUT}/crystal{s}.png',optimize=True)
Image.open(f'{SRC}/floor.jpg').resize((512,512),Image.LANCZOS).save(f'{OUT}/floor.jpg',quality=88)
Image.open(f'{SRC}/levelup-frame.jpg').save(f'{OUT}/levelup.jpg',quality=86)
json.dump(meta,open(f'{OUT}/sprites.json','w'),indent=1)
print(json.dumps(meta))
