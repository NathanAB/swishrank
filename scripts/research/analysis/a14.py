import sys, json, numpy as np, pandas as pd, warnings
warnings.filterwarnings('ignore')
from scipy.stats import norm
S=sys.argv[1]
df=pd.read_pickle(S+'/df3.pkl').set_index('id')
pm={}; vol={}
for s in ('2024-25','2025-26','2026-27'):
    j=json.load(open(f'scripts/polymarket/{s}.json')); pm.update(j['chances']); vol.update(j.get('volume',{}))
df['pm']=pd.Series(pm); df['vol']=pd.Series(vol)
v=df[df.pm.notna()&df.vegas.notna()].copy(); v['vg']=v.vegas.astype(float)
ll=lambda p: -(v.y*np.log(np.clip(p,1e-12,1))+(1-v.y)*np.log(np.clip(1-p,1e-12,1)))
kl=lambda a,q: (a*np.log(a/q)+(1-a)*np.log((1-a)/(1-q)))
c=lambda p: p.clip(0.005,0.995)
v['wk']=v.season+':'+(v.d//7).astype(str)
def boot(x,blk,n=2000):
    g=pd.DataFrame({'x':x,'b':blk}).groupby('b').x.agg(['sum','count']).values; r=np.random.default_rng(7); i=r.integers(0,len(g),(n,len(g))); m=g[i,0].sum(1)/g[i,1].sum(1); return np.percentile(m,2.5),np.percentile(m,97.5)
v['l_pm']=ll(v.pm); v['l_vg']=ll(v.vg); v['l_m']=ll(v.p4); v['mid']=norm.cdf((norm.ppf(c(v.pm))+norm.ppf(c(v.vg)))/2); v['l_mid']=ll(v.mid)
print(v.groupby('season').agg(n=('y','size'),model=('l_m','mean'),vegas=('l_vg','mean'),polymarket=('l_pm','mean'),both_markets=('l_mid','mean')).round(4))
for a,b,lab in (('l_m','l_vg','model - Vegas'),('l_m','l_pm','model - Polymarket'),('l_pm','l_vg','Polymarket - Vegas'),('l_mid','l_vg','both markets - Vegas')):
    d=(v[a]-v[b]); lo,hi=boot(d.values,v.wk.values); print(f'{lab:24s} {d.mean():+.4f} [{lo:+.4f},{hi:+.4f}]  n={len(d)}')
print('distance between the two markets (KL) %.4f; model to Vegas %.4f; model to Polymarket %.4f; model to both %.4f'%(kl(c(v.vg),c(v.pm)).mean(),kl(c(v.vg),c(v.p4)).mean(),kl(c(v.pm),c(v.p4)).mean(),kl(c(v.mid),c(v.p4)).mean()))
print('rms gap in z: markets %.3f, model vs Vegas %.3f'%(np.sqrt(((norm.ppf(c(v.pm))-norm.ppf(c(v.vg)))**2).mean()),np.sqrt(((norm.ppf(c(v.p4))-norm.ppf(c(v.vg)))**2).mean())))
# accuracy and by volume
print('accuracy: model %.3f vegas %.3f polymarket %.3f'%(((v.p4>.5)==(v.y==1)).mean(),((v.vg>.5)==(v.y==1)).mean(),((v.pm>.5)==(v.y==1)).mean()))
df[['pm','vol']].to_pickle(S+'/pm.pkl')
