import sys, json, numpy as np, pandas as pd, warnings, statsmodels.api as sm
warnings.filterwarnings('ignore')
from scipy.stats import norm
from scipy.optimize import minimize_scalar
S=sys.argv[1]
R={}
for f in ('rules','decay','more'): R.update({f+':'+k:v for k,v in json.load(open(f'{S}/{f}.json')).items()})
df=pd.read_pickle(S+'/df3.pkl').set_index('id'); df=df[(df.season<'2026')&df.vegas.notna()]
k=np.minimum(df.kh,df.ka).values; y=df.y.values; pv=df.vegas.astype(float).clip(0.005,0.995).values; tune=(df.season<='2022-23').values
ll=lambda p,yy: -(yy*np.log(np.clip(p,1e-12,1))+(1-yy)*np.log(np.clip(1-p,1e-12,1)))
def kl(q): q=np.clip(q,1e-9,1-1e-9); return pv*np.log(pv/q)+(1-pv)*np.log((1-pv)/(1-q))
def price(e):
    sig=minimize_scalar(lambda s: ll(norm.cdf(e[tune]/s),y[tune]).mean(),bounds=(1.5,5),method='bounded').x
    early=tune&(k<5); w=minimize_scalar(lambda w: ll(norm.cdf(e[early]/(sig*w)),y[early]).mean(),bounds=(0.8,2),method='bounded').x
    return norm.cdf(e/np.where(k<5,sig*w,sig))
P={n:price(pd.Series(es).reindex(df.index).values) for n,es in R.items()}
b=P['rules:v4']; rows=[(n,(kl(p)-kl(b)).mean(),(ll(p,y)-ll(b,y)).mean()) for n,p in P.items() if not n.endswith(':v4')]
t=pd.DataFrame(rows,columns=['v','dKL','dLL']); m=sm.OLS(t.dLL,sm.add_constant(t.dKL)).fit()
print(len(t),'variants, all 11 seasons pooled: slope of outcome change on distance-to-Vegas change %.2f (se %.2f), corr %.2f'%(m.params.dKL,m.bse.dKL,np.corrcoef(t.dKL,t.dLL)[0,1]))
print(t.sort_values('dKL').head(6).round(4).to_string()); print(t.sort_values('dKL').tail(4).round(4).to_string())
