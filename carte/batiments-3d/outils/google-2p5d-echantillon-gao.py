import json, numpy as np, rasterio, statistics
from rasterio.warp import transform
from rasterio.features import rasterize
from rasterio.transform import from_origin
F=4  # lecture décimée : 0.5 m -> 2 m (résolution effective Google = 4 m)
fc=json.load(open('gba-gao.geojson'))
feats=fc['features']
# reprojection WGS84 -> UTM 30N des anneaux
utm=[]
for f in feats:
    ring=f['geometry']['coordinates'][0]
    xs,ys=transform('EPSG:4326','EPSG:32630',[c[0] for c in ring],[c[1] for c in ring])
    utm.append(list(zip(xs,ys)))
best=np.full(len(feats), np.nan, dtype=np.float32)
pres=np.full(len(feats), np.nan, dtype=np.float32)
for fn in ['gao_main.tif','gao_east.tif']:
    with rasterio.open(fn) as ds:
        H=ds.height//F; W=ds.width//F
        hgt=ds.read(2, out_shape=(H,W), resampling=rasterio.enums.Resampling.average)
        prs=ds.read(3, out_shape=(H,W), resampling=rasterio.enums.Resampling.average)
        tr=from_origin(ds.bounds.left, ds.bounds.top, ds.res[0]*F, ds.res[1]*F)
        b=ds.bounds
    hgt[hgt<0]=np.nan
    # bâtiments dont le premier sommet tombe dans cette tuile
    idx=[i for i,r in enumerate(utm) if b.left<=r[0][0]<b.right and b.bottom<=r[0][1]<b.top]
    print(fn, 'bâtiments', len(idx))
    shapes=[({'type':'Polygon','coordinates':[utm[i]]}, i+1) for i in idx]
    lab=rasterize(shapes, out_shape=(H,W), transform=tr, fill=0, all_touched=True, dtype='int32')
    m=lab>0
    ids=lab[m]; hv=hgt[m]; pv=prs[m]
    ok=~np.isnan(hv)
    s=np.bincount(ids[ok], weights=hv[ok], minlength=len(feats)+1); c=np.bincount(ids[ok], minlength=len(feats)+1)
    sp=np.bincount(ids[ok], weights=pv[ok], minlength=len(feats)+1)
    for i in idx:
        if c[i+1]>0:
            best[i]=s[i+1]/c[i+1]; pres[i]=sp[i+1]/c[i+1]
out=[]
for i,f in enumerate(feats):
    h=None if np.isnan(best[i]) else round(float(best[i]),2)
    p=None if np.isnan(pres[i]) else round(float(pres[i]),2)
    out.append({'type':'Feature','properties':{'source':f['properties']['source'],'id':f['properties']['id'],'height':h,'presence':p},'geometry':f['geometry']})
hs=[o['properties']['height'] for o in out if o['properties']['height'] is not None]
print('valid', len(hs), '/', len(out), 'min/med/mean/max', min(hs), statistics.median(hs), round(statistics.mean(hs),2), max(hs))
print('deciles', [round(q,2) for q in statistics.quantiles(hs, n=10)])
print('>=2m', round(100*sum(1 for h in hs if h>=2)/len(hs)), '%')
json.dump({'type':'FeatureCollection','features':out}, open('google-gao.geojson','w'), separators=(',',':'))
