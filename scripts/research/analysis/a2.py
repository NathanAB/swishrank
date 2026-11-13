import sys, numpy as np, pandas as pd
from scipy.stats import norm
from scipy.optimize import minimize
S=sys.argv[1]
df=pd.read_pickle(S+'/df.pkl').sort_values(['t','id']).reset_index(drop=True)
SIG=2.986
ll=lambda p,y: -(y*np.log(np.clip(p,1e-12,1))+(1-y)*np.log(np.clip(1-p,1e-12,1)))
df['zv']=norm.ppf(df.vegas.astype(float).clip(0.005,0.995))
df['dv']=df.zv*df.sig-df.e4      # what Vegas adds for the home side, model units
df['cm']=np.sign(df.m)*np.sqrt(abs(df.m)+3)
df['res']=df.cm-df.e4           # model's miss on counted margin
v=df[df.vegas.notna()&(df.season<'2026')].copy()
print('sd dv',v.dv.std().round(3),'sd e4',v.e4.std().round(3),'corr(e4,zv*sig)',np.corrcoef(v.e4,v.zv*v.sig)[0,1].round(4), 'mean dv',v.dv.mean().round(3))
# 1. blend: walk-forward by season logistic on z_model, z_vegas
def fit(X,y):
    f=lambda b: ll(norm.cdf(X@b),y).mean()
    return minimize(f,np.zeros(X.shape[1]),method='BFGS').x
seasons=sorted(v.season.unique())
rows=[]
for s in seasons[3:]:
    tr=v[v.season<s]; te=v[v.season==s]
    def X(d,cols): return np.column_stack([np.ones(len(d))]+[d[c] for c in cols])
    v=v.assign(zm=v.e4/v.sig); tr=v[v.season<s]; te=v[v.season==s]
    out={'season':s,'n':len(te),'veg':te.lv.mean(),'mod':te.l4.mean()}
    for name,cols in [('vegcal',['zv']),('blend',['zv','zm'])]:
        b=fit(X(tr,cols),tr.y.values); out[name]=ll(norm.cdf(X(te,cols)@b),te.y.values).mean(); out[name+'_b']=np.round(b,3)
    rows.append(out)
r=pd.DataFrame(rows); print(r.round(4).to_string())
w=r.n/r.n.sum(); print('pooled: veg %.4f vegcal %.4f blend %.4f mod %.4f'%((r.veg*w).sum(),(r.vegcal*w).sum(),(r.blend*w).sum(),(r['mod']*w).sum()))
# 2. is Vegas' disagreement with us persistent per team? team-signed dv
long=pd.concat([v.assign(team=v.home,sd=v.dv,sres=v.res,opp=v.away),v.assign(team=v.away,sd=-v.dv,sres=-v.res,opp=v.home)]).sort_values(['t','id'])
g=long.groupby(['season','team'])
long['prev_sd']=g.sd.shift(1); long['prev5_sd']=g.sd.transform(lambda x:x.shift(1).rolling(5,min_periods=1).mean())
long['prev10_res']=g.sres.transform(lambda x:x.shift(1).rolling(10,min_periods=3).mean())
print('autocorr of team-signed Vegas disagreement, lag1:',long[['sd','prev_sd']].corr().iloc[0,1].round(3),' vs mean of last 5:',long[['sd','prev5_sd']].corr().iloc[0,1].round(3))
print('team-season share of dv variance:', (g.sd.transform('mean').var()/long.sd.var()).round(3))
print('corr(dv, own last-10 model miss):',long[['sd','prev10_res']].corr().iloc[0,1].round(3))
