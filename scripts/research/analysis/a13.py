import sys, numpy as np, pandas as pd, lightgbm as lgb, warnings
warnings.filterwarnings('ignore')
from scipy.stats import norm
S=sys.argv[1]
df=pd.read_pickle(S+'/df3.pkl').sort_values(['t','id']).reset_index(drop=True)
df['hourET']=pd.to_datetime(df.t).dt.tz_convert('America/New_York').dt.hour
v=df[df.vegas.notna()&(df.season<'2026')].copy()
def klp(d,q):
    a=d.vegas.astype(float).clip(0.005,0.995); q=np.clip(q,1e-9,1-1e-9); return (a*np.log(a/q)+(1-a)*np.log((1-a)/(1-q)))
ll=lambda p,y: -(y*np.log(np.clip(p,1e-12,1))+(1-y)*np.log(np.clip(1-p,1e-12,1)))
G={'ratings':['r','seed','pp','cen','dev'],'lineup':['pos','neg','top','n','miss','shift'],'schedule':['rest','k','g3in4'],'form':['m_all','m_l5','m_l10','res_l10','res_all','wp','pp_l10']}
glob=['d','playoff','he','e4','extra','hourET','covered']
def cols(groups): return [c+s for g in groups for c in G[g] for s in 'ha']+glob
v['wk']=v.season+':'+(v.d//7).astype(str)
def boot(x,blk,n=1000):
    g=pd.DataFrame({'x':x,'b':blk}).groupby('b').x.agg(['sum','count']).values; r=np.random.default_rng(7); i=r.integers(0,len(g),(n,len(g))); m=g[i,0].sum(1)/g[i,1].sum(1); return np.percentile(m,2.5),np.percentile(m,97.5)
def run(cs,label,first=3,seeds=3):
    out=[]
    for s in sorted(v.season.unique())[first:]:
        tr=v[v.season<s]; te=v[v.season==s]; adj=np.zeros(len(te))
        for sd in range(seeds):
            m=lgb.LGBMRegressor(n_estimators=500,learning_rate=0.02,num_leaves=15,min_child_samples=40,subsample=0.8,subsample_freq=1,colsample_bytree=0.7,reg_lambda=5,verbose=-1,random_state=sd).fit(tr[cs],tr.dv); adj+=m.predict(te[cs])/seeds
        p=norm.cdf((te.e4+adj)/te.sig); out.append(pd.DataFrame({'season':s,'wk':te.wk,'grp':te.grp,'d':te.d,'playoff':te.playoff,'l':ll(p,te.y),'kl':klp(te,p),'l4':te.l4,'kl4':te.kl4,'lv':te.lv}))
    o=pd.concat(out); dl=(o.l-o.l4); lo,hi=boot(dl.values,o.wk.values)
    print(f'{label:30s} KL {o.kl.mean():.4f} (v4 {o.kl4.mean():.4f}) | logloss {o.l.mean():.4f} v4 {o.l4.mean():.4f} vegas {o.lv.mean():.4f} | d_ll {dl.mean():+.4f} [{lo:+.4f},{hi:+.4f}]')
    return o
o=run(cols(G),'all features')
for g in G: run(cols([x for x in G if x!=g]),f'  without {g}')
o['ph']=np.select([o.playoff==1,o.d<=14,o.d>140],['playoffs','first2wk','last5wk'],'mid')
print(o.groupby('ph').apply(lambda x:pd.Series({'n':len(x),'d_ll':(x.l-x.l4).mean(),'gap_before':(x.l4-x.lv).mean(),'gap_after':(x.l-x.lv).mean()})).round(4))
print(o.groupby('season').apply(lambda x:pd.Series({'d_ll':(x.l-x.l4).mean(),'gap_before':(x.l4-x.lv).mean(),'gap_after':(x.l-x.lv).mean()})).round(4))
