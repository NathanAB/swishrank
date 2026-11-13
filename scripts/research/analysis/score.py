import sys, json, numpy as np, pandas as pd, warnings
warnings.filterwarnings('ignore')
from scipy.stats import norm
from scipy.optimize import minimize_scalar
S=sys.argv[1]; R=json.load(open(sys.argv[2])); base=sys.argv[3] if len(sys.argv)>3 else 'v4'
df=pd.read_pickle(S+'/df3.pkl').set_index('id')
df=df[df.season<'2026']; k=np.minimum(df.kh,df.ka).values; y=df.y.values; pv=df.vegas.astype(float).clip(0.005,0.995).values
has=~np.isnan(pv); tune=(df.season<='2022-23').values; wk=(df.season+':'+(df.d//7).astype(str)).values
ll=lambda p,yy=None: (lambda yy: -(yy*np.log(np.clip(p,1e-12,1))+(1-yy)*np.log(np.clip(1-p,1e-12,1))))(y if yy is None else yy)
def kl(q): q=np.clip(q,1e-9,1-1e-9); return pv*np.log(pv/q)+(1-pv)*np.log((1-pv)/(1-q))
def price(e):
    f=lambda s: ll(norm.cdf(e[tune]/s),y[tune]).mean(); sig=minimize_scalar(f,bounds=(1.5,5),method='bounded').x
    early=tune&(k<5); g=lambda w: ll(norm.cdf(e[early]/(sig*w)),y[early]).mean(); w=minimize_scalar(g,bounds=(0.8,2),method='bounded').x
    return norm.cdf(e/np.where(k<5,sig*w,sig)),sig,w
def boot(x,blk,n=1000):
    g=pd.DataFrame({'x':x,'b':blk}).groupby('b').x.agg(['sum','count']).values; r=np.random.default_rng(7); i=r.integers(0,len(g),(n,len(g))); m=g[i,0].sum(1)/g[i,1].sum(1); return np.percentile(m,2.5),np.percentile(m,97.5)
P={n:price(pd.Series(es).reindex(df.index).values) for n,es in R.items()}
pb=P[base][0]
print(f"{'variant':16s} sigma |  dKL tune [95%]            dKL expl [95%]           | dLL tune [95%]            dLL expl [95%]")
for n,(p,sig,w) in P.items():
    row=f"{n:16s} {sig:.3f} |"
    for metric in (kl,ll):
        for m in (tune&has,~tune&has):
            d=(metric(p)-metric(pb))[m]; lo,hi=boot(d,wk[m]); row+=f" {d.mean():+.4f} [{lo:+.4f},{hi:+.4f}] "
        row+='|'
    print(row)
