import sys, numpy as np, pandas as pd
from scipy.stats import norm
import statsmodels.api as sm
S=sys.argv[1]
df=pd.read_pickle(S+'/df.pkl').sort_values(['t','id']).reset_index(drop=True)
pv=df.vegas.astype(float).clip(0.005,0.995)
def klp(te,q):
    a=te.vegas.astype(float).clip(0.005,0.995); return (a*np.log(a/q)+(1-a)*np.log((1-a)/(1-q))).mean()
ll=lambda p,y: -(y*np.log(np.clip(p,1e-12,1))+(1-y)*np.log(np.clip(1-p,1e-12,1)))
df['cm']=np.sign(df.m)*np.sqrt(abs(df.m)+3); df['res']=df.cm-df.e4
v=df[df.vegas.notna()&(df.season<'2026')].copy()
long=pd.concat([v.assign(team=v.home,sd=v.dv,sres=v.res,side=1),v.assign(team=v.away,sd=-v.dv,sres=-v.res,side=-1)]).sort_values(['t','id'])
g=long.groupby(['season','team'])
for k in (1,3,5,10,20):
    long[f'm{k}']=g.sd.transform(lambda x:x.shift(1).rolling(k,min_periods=1).mean())
long['ew']=g.sd.transform(lambda x:x.shift(1).ewm(halflife=4).mean())
long['r10']=g.sres.transform(lambda x:x.shift(1).rolling(10,min_periods=3).mean())
long['r5']=g.sres.transform(lambda x:x.shift(1).rolling(5,min_periods=2).mean())
feats=['m1','m3','m5','m10','m20','ew','r10','r5']
h=long[long.side==1].set_index('id')[feats]; a=long[long.side==-1].set_index('id')[feats]
d=(h-a).fillna(0); d.columns=['D'+c for c in feats]
v=v.join(d,on='id')
# how much of Vegas' disagreement is predictable from its own earlier disagreement about the two teams?
for c in d.columns:
    m=sm.OLS(v.dv,sm.add_constant(v[[c]])).fit(); print(c,'slope %.3f R2 %.3f'%(m.params[c],m.rsquared))
# market-informed: e4 + lam*Dew, lam fitted on earlier seasons
seasons=sorted(v.season.unique()); out=[]
for s in seasons[2:]:
    tr=v[v.season<s]; te=v[v.season==s]
    for c in ['Dm5','Dew','Dm10']:
        lam=sm.OLS(tr.dv,tr[[c]]).fit().params[c]
        p=norm.cdf((te.e4+lam*te[c])/te.sig)
        out.append((s,c,len(te),ll(p,te.y).mean()-te.l4.mean(),ll(p,te.y).mean()-te.lv.mean(),klp(te,p),te.kl4.mean()))
o=pd.DataFrame(out,columns=['season','feat','n','d_vs_v4','gap_vs_vegas','kl','kl4'])
print(o.groupby('feat').apply(lambda x: pd.Series({'d_vs_v4':np.average(x.d_vs_v4,weights=x.n),'gap_vs_vegas':np.average(x.gap_vs_vegas,weights=x.n),'kl':np.average(x.kl,weights=x.n),'kl4':np.average(x.kl4,weights=x.n)})).round(4))
# our own recent misses: does the model under-react to recent form? regress result residual on r10 diff
m=sm.OLS(v.res,sm.add_constant(v[['Dr10','Dr5']])).fit(); print('result miss on own recent misses:',m.params.round(3).to_dict(),m.bse.round(3).to_dict())
m=sm.OLS(v.dv,sm.add_constant(v[['Dr10']])).fit(); print('vegas dv on our recent misses:',m.params.round(3).to_dict(),'R2',round(m.rsquared,3))
# biggest persistent disagreements
ts=long.groupby(['season','team']).agg(sd=('sd','mean'),n=('sd','size'),miss=('sres','mean')).sort_values('sd')
print(ts.head(8).round(2)); print(ts.tail(8).round(2)); print('corr team-season mean dv vs mean miss',ts[['sd','miss']].corr().iloc[0,1].round(3))
v.to_pickle(S+'/v.pkl')
