import sys, numpy as np, pandas as pd, warnings, statsmodels.api as sm
warnings.filterwarnings('ignore')
from scipy import sparse
from sklearn.linear_model import Ridge
S=sys.argv[1]
df=pd.read_pickle(S+'/df3.pkl').sort_values(['t','id']).reset_index(drop=True)
v=df[df.vegas.notna()&(df.season<'2026')].reset_index(drop=True)
v['orShift']=(v.eOr-(v.e4-v.extra)); v['dvL']=v.dv-v.orShift   # disagreement left once the model is handed the true lineup and minutes
rng=np.random.default_rng(0); fold=rng.integers(0,5,len(v))
def cv(span,target,alpha=1.0):
    key_h=v.season+v.home+':'+(v.d//span).astype(str); key_a=v.season+v.away+':'+(v.d//span).astype(str)
    cats={k:i for i,k in enumerate(pd.unique(pd.concat([key_h,key_a])))}
    n=len(v); X=sparse.csr_matrix((np.r_[np.ones(n),-np.ones(n)],(np.r_[np.arange(n),np.arange(n)],np.r_[key_h.map(cats),key_a.map(cats)])),shape=(n,len(cats)))
    y=v[target].values; pred=np.zeros(n)
    for f in range(5):
        tr=fold!=f; pred[~tr]=Ridge(alpha=alpha,fit_intercept=True).fit(X[tr],y[tr]).predict(X[~tr])
    return 1-((y-pred)**2).sum()/((y-y.mean())**2).sum()
print('share of the disagreement that is a team-level state (held-out games, team x period effects):')
for span,lab in ((400,'whole season'),(60,'2 months'),(30,'month'),(14,'fortnight'),(7,'week')):
    print(f'  team x {lab:13s} raw disagreement {max(cv(span,"dv",a) for a in (0.3,1,3)):.3f}   with true lineups handed over {max(cv(span,"dvL",a) for a in (0.3,1,3)):.3f}')
# regress dv on own lags
L=pd.concat([v.assign(team=v.home,sd=v.dv),v.assign(team=v.away,sd=-v.dv)]).sort_values(['t','id']); g=L.groupby(['season','team'])
for k in range(1,9): L[f'l{k}']=g.sd.shift(k)
d=L.dropna(); m=sm.OLS(d.sd,sm.add_constant(d[[f'l{k}' for k in range(1,9)]])).fit(); print('team-signed dv on its own 8 lags: R2 %.3f'%m.rsquared, m.params.round(2).values[1:])
print('rms: dv %.3f, after true lineups %.3f'%(np.sqrt((v.dv**2).mean()),np.sqrt((v.dvL**2).mean())))
m=sm.OLS(v.cm-v.eOr+0*v.extra,v[['dvL']]).fit(); print('result (minus true-lineup model) on leftover disagreement: %.3f se %.3f'%(m.params.iloc[0],m.bse.iloc[0]))
