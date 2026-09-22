import json, math, sys, statistics
# bbox Gao (WGS84)
LONMIN, LATMIN, LONMAX, LATMAX = -0.13, 16.19, 0.07, 16.35
R = 6378137.0
def to3857(lon, lat):
    return lon*math.pi/180*R, math.log(math.tan(math.pi/4+lat*math.pi/360))*R
def to4326(x, y):
    return x/R*180/math.pi, (2*math.atan(math.exp(y/R))-math.pi/2)*180/math.pi
xmin,ymin = to3857(LONMIN,LATMIN); xmax,ymax = to3857(LONMAX,LATMAX)
heights = json.load(open('lod1_gao.json'))
print('heights entries', len(heights))
feats=[]; nojoin=0; novalid=0
for fn in ['odbl_gao.geojson','poly_gao.geojson']:
    with open(fn) as f:
        for line in f:
            line=line.strip().rstrip(',')
            if not line.startswith('{ "type": "Feature"'): continue
            ft=json.loads(line)
            ring=ft['geometry']['coordinates'][0]
            if ft['geometry']['type']!='Polygon': continue
            x0=ring[0][0]; y0=ring[0][1]
            if not (xmin<=x0<=xmax and ymin<=y0<=ymax): continue
            p=ft['properties']; key=str(p.get('source',''))+str(p.get('id',''))+str(p.get('region',''))
            hv=heights.get(key)
            if hv is None: nojoin+=1; h=None; var=None
            else:
                h=hv['height']; var=hv['var']
                if h is None or h<0: novalid+=1; h=None; var=None
            coords=[[list(map(lambda c: round(c,6), to4326(x,y))) for x,y in r] for r in ft['geometry']['coordinates']]
            feats.append({'type':'Feature','properties':{'source':p.get('source'),'id':p.get('id'),'height':None if h is None else round(h,2),'var':None if var is None else round(var,3)},'geometry':{'type':'Polygon','coordinates':coords}})
print('gao buildings', len(feats), 'no join', nojoin, 'invalid height', novalid)
hs=[f['properties']['height'] for f in feats if f['properties']['height'] is not None]
print('valid', len(hs), 'min/med/mean/max', min(hs), statistics.median(hs), round(statistics.mean(hs),2), max(hs))
import collections
print('by source', collections.Counter(f['properties']['source'] for f in feats))
qs=[statistics.quantiles(hs, n=10)]
print('deciles', [round(q,2) for q in qs[0]])
json.dump({'type':'FeatureCollection','features':feats}, open('gba-gao.geojson','w'), separators=(',',':'))
