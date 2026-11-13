import json, sys, numpy as np, pandas as pd
from scipy.stats import norm
S=sys.argv[1]
df=pd.DataFrame(json.load(open(S+'/games.json')))
df['y']=(df.hs>df['as']).astype(int); df['m']=df.hs-df['as']
SIG,W=2.986,1.14
k=np.minimum(df.kh,df.ka)
df['sig']=np.where(k<5,SIG*W,SIG)
df['p4']=norm.cdf(df.e4/df.sig); df['p3']=norm.cdf(df.e3/np.where(k<5,3.037*1.14,3.037)); df['ptip']=norm.cdf(df.eTip/df.sig)
ll=lambda p,y: -(y*np.log(np.clip(p,1e-15,1))+(1-y)*np.log(np.clip(1-p,1e-15,1)))
df['l4']=ll(df.p4,df.y); df['l3']=ll(df.p3,df.y); df['ltip']=ll(df.ptip,df.y)
df['lv']=ll(df.vegas.astype(float),df.y)
df['grp']=np.where(df.season<='2022-23','tune',np.where(df.season<='2025-26','expl','now'))
df['playoff']=df.note.fillna('').str.contains('Round|Finals|Semifinal|Play-In')
v=df[df.vegas.notna()]
print(v.groupby('grp')[['l4','l3','ltip','lv']].mean().round(4), v.groupby('grp').size())
print(v.groupby('season')[['l4','ltip','lv']].mean().assign(gap=lambda x:x.l4-x.lv, gaptip=lambda x:x.ltip-x.lv).round(4))
# phase of season
v=v.assign(ph=pd.cut(v.d,[-1,14,30,60,100,140,175,400]))
print(v[v.season<'2026'].groupby('ph',observed=True).apply(lambda g: pd.Series({'n':len(g),'l4':g.l4.mean(),'lv':g.lv.mean(),'gap':(g.l4-g.lv).mean(),'gaptip':(g.ltip-g.lv).mean()})).round(4))
print(v[v.season<'2026'].groupby('playoff').apply(lambda g: pd.Series({'n':len(g),'l4':g.l4.mean(),'lv':g.lv.mean(),'gap':(g.l4-g.lv).mean()})).round(4))
df.to_pickle(S+'/df.pkl')
