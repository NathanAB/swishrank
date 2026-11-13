import sys, numpy as np, pandas as pd
from scipy.stats import norm
S=sys.argv[1]
df=pd.read_pickle(S+'/df.pkl').sort_values(['t','id']).reset_index(drop=True)
ll=lambda p,y: -(y*np.log(np.clip(p,1e-12,1))+(1-y)*np.log(np.clip(1-p,1e-12,1)))
pv=df.vegas.astype(float).clip(0.005,0.995)
kl=lambda q: pv*np.log(pv/q)+(1-pv)*np.log((1-pv)/(1-q))
df['kl4']=kl(df.p4.clip(1e-9,1-1e-9)); df['kl3']=kl(df.p3.clip(1e-9,1-1e-9)); df['kltip']=kl(df.ptip.clip(1e-9,1-1e-9))
df['zv']=norm.ppf(pv); df['dv']=df.zv*df.sig-df.e4
v=df[df.vegas.notna()&(df.season<'2026')].copy()
v['wk']=v.season+':'+(v.d//7).astype(str)
def boot(x,blk,n=2000,seed=1):
    g=pd.DataFrame({'x':x,'b':blk}).groupby('b').x.agg(['sum','count']).values; r=np.random.default_rng(seed); idx=r.integers(0,len(g),(n,len(g)))
    m=g[idx,0].sum(1)/g[idx,1].sum(1); return x.mean(),np.percentile(m,2.5),np.percentile(m,97.5)
for grp,d in v.groupby('grp'):
    print(grp,'gap by outcomes  %.4f [%.4f,%.4f]'%boot((d.l4-d.lv).values,d.wk.values),' | KL to Vegas %.4f [%.4f,%.4f]'%boot(d.kl4.values,d.wk.values))
    print(grp,'v4-v3 by outcomes %.4f [%.4f,%.4f]'%boot((d.l4-d.l3).values,d.wk.values),' | by KL %.4f [%.4f,%.4f]'%boot((d.kl4-d.kl3).values,d.wk.values))
v['ph']=pd.cut(v.d,[-1,14,30,60,100,140,175,400])
print(v.groupby('ph',observed=True).agg(n=('kl4','size'),kl=('kl4','mean'),kltip=('kltip','mean'),sd_dv=('dv','std'),mean_dv=('dv','mean')).round(4))
print(v.groupby('playoff').agg(n=('kl4','size'),kl=('kl4','mean'),sd_dv=('dv','std'),mean_dv=('dv','mean')).round(4))
# calibration of p4 by decile vs outcomes and vs vegas
v['dec']=pd.qcut(v.p4,10)
print(v.groupby('dec',observed=True).agg(n=('y','size'),p4=('p4','mean'),won=('y','mean'),veg=('vegas','mean')).round(3))
# slope: regress zv*sig on e4
import statsmodels.api as sm
print(sm.OLS(v.zv*v.sig,sm.add_constant(v[['e4']])).fit().params.round(3).to_dict())
X=v.assign(td=v.rh-v.ra,pd_=v.pph-v.ppa,b2b=v.b2ba.astype(int)-v.b2bh.astype(int),he=(~v.neutral).astype(int))[['td','pd_','b2b','extra','he']]
m=sm.OLS(v.zv*v.sig,X).fit(); print('Vegas margin on our parts:',m.params.round(3).to_dict(),'R2',round(m.rsquared,4))
m=sm.OLS(v.cm if 'cm' in v else np.sign(v.m)*np.sqrt(abs(v.m)+3),X).fit(); print('Result on our parts:    ',m.params.round(3).to_dict(), m.bse.round(3).to_dict())
df.to_pickle(S+'/df.pkl')
