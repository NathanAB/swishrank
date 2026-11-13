import sys, json, numpy as np, pandas as pd, warnings
warnings.filterwarnings('ignore')
from scipy.stats import norm
from scipy.optimize import minimize_scalar
S=sys.argv[1]
R={}
for f in ('rules','decay','more','luck1','luck2','luck3'):
    try: R.update({f+':'+k:v for k,v in json.load(open(f'{S}/{f}.json')).items()})
    except FileNotFoundError: pass
df=pd.read_pickle(S+'/df3.pkl').set_index('id'); df=df[(df.season<'2026')]
k=np.minimum(df.kh,df.ka).values; y=df.y.values; cm=df.cm.values; tune=(df.season<='2022-23').values; wk=(df.season+':'+(df.d//7).astype(str)).values
ll=lambda p,yy: -(yy*np.log(np.clip(p,1e-12,1))+(1-yy)*np.log(np.clip(1-p,1e-12,1)))
def price(e):
    sig=minimize_scalar(lambda s: ll(norm.cdf(e[tune]/s),y[tune]).mean(),bounds=(1.5,5),method='bounded').x
    early=tune&(k<5); w=minimize_scalar(lambda w: ll(norm.cdf(e[early]/(sig*w)),y[early]).mean(),bounds=(0.8,2),method='bounded').x
    return norm.cdf(e/np.where(k<5,sig*w,sig))
blocks=pd.factorize(wk)[0]; nb=blocks.max()+1; rng=np.random.default_rng(7); idx=rng.integers(0,nb,(2000,nb)); cnt=np.bincount(blocks,minlength=nb)
def z(d):
    s=np.bincount(blocks,weights=d,minlength=nb); m=s[idx].sum(1)/cnt[idx].sum(1); return d.mean(),m.std()
E={n:pd.Series(es).reindex(df.index).values for n,es in R.items()}
b=E['rules:v4']; pb=price(b); rows=[]
for n,e in E.items():
    if n.endswith(':v4') or np.isnan(e).any(): continue
    dl,sl=z(ll(price(e),y)-ll(pb,y)); dm,sm=z((cm-e)**2-(cm-b)**2); rows.append((n,dl,sl,dm,sm))
t=pd.DataFrame(rows,columns=['v','dLL','seLL','dMSE','seMSE']); t['zLL']=t.dLL/t.seLL; t['zMSE']=t.dMSE/t.seMSE
print(len(t),'variants on all 11 seasons. corr of the two mean changes %.2f; same sign in %d of %d'%(np.corrcoef(t.dLL,t.dMSE)[0,1],(np.sign(t.dLL)==np.sign(t.dMSE)).sum(),len(t)))
print('median |z|: win/loss log loss %.2f, margin error %.2f; ratio of |z| (margin / win-loss), median %.2f'%(t.zLL.abs().median(),t.zMSE.abs().median(),(t.zMSE.abs()/t.zLL.abs()).median()))
print('variants clear of zero at 95%%: log loss %d, margin error %d'%((t.zLL.abs()>1.96).sum(),(t.zMSE.abs()>1.96).sum()))
print(t[t.v.isin(['rules:site_unlisted25','rules:np160','rules:n0_64','decay:decay90_n48','rules:a065','rules:q04','luck1:adj_3_tm_w50','rules:fill45','rules:recent3'])].round(4).to_string())
# v4 vs v3 for reference
e3=df.e3.values; e4=df.e4.values; has=~np.isnan(e3)
dl,sl=z(np.where(has,ll(df.p4.values,y)-ll(df.p3.values,y),0)); dm,sm=z(np.where(has,(cm-e4)**2-(cm-e3)**2,0)); print('v4 - v3: log loss %.4f (z %.1f), margin error %.4f (z %.1f)'%(dl,dl/sl,dm,dm/sm))
