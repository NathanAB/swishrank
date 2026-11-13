import sys, numpy as np, pandas as pd, lightgbm as lgb, warnings
warnings.filterwarnings('ignore')
from scipy.stats import norm
S=sys.argv[1]
df=pd.read_pickle(S+'/df2.pkl').sort_values(['t','id']).reset_index(drop=True)
def klp(d,q):
    a=d.vegas.astype(float).clip(0.005,0.995); q=np.clip(q,1e-9,1-1e-9); return (a*np.log(a/q)+(1-a)*np.log((1-a)/(1-q)))
ll=lambda p,y: -(y*np.log(np.clip(p,1e-12,1))+(1-y)*np.log(np.clip(1-p,1e-12,1)))
df['res']=df.cm-df.e4
df['playoff']=df.playoff.astype(int); df['he']=(~df.neutral).astype(int)
# team-side long table for history features
sides=[]
for s,o,sg in (('h','a',1),('a','h',-1)):
    sides.append(pd.DataFrame({'id':df.id,'season':df.season,'t':df.t,'team':df['home' if s=='h' else 'away'],'side':s,'m':sg*df.m,'cm':sg*df.cm,'res':sg*df.res,'dv':sg*df.dv,'pp':df['pp'+s],'r':df['r'+s],'win':(sg*df.m>0).astype(int)}))
L=pd.concat(sides).sort_values(['t','id']); g=L.groupby(['season','team'])
sh=lambda col,f: g[col].transform(lambda x:f(x.shift(1)))
L['m_all']=sh('m',lambda x:x.expanding().mean()); L['m_l5']=sh('m',lambda x:x.rolling(5,min_periods=1).mean()); L['m_l10']=sh('m',lambda x:x.rolling(10,min_periods=1).mean())
L['res_l10']=sh('res',lambda x:x.rolling(10,min_periods=1).mean()); L['res_all']=sh('res',lambda x:x.expanding().mean())
L['wp']=sh('win',lambda x:x.expanding().mean()); L['pp_l10']=sh('pp',lambda x:x.rolling(10,min_periods=1).mean())
L['dv_ew']=sh('dv',lambda x:x.ewm(halflife=4).mean()); L['dv_l1']=sh('dv',lambda x:x)
L['g3in4']=g.t.transform(lambda x:(pd.to_datetime(x)-pd.to_datetime(x).shift(2)).dt.total_seconds()/86400<3.5).astype(int)
hist=['m_all','m_l5','m_l10','res_l10','res_all','wp','pp_l10','g3in4']; mk=['dv_ew','dv_l1']
for s in 'ha':
    w=L[L.side==s].set_index('id')[hist+mk]; w.columns=[c+s for c in w.columns]; df=df.join(w,on='id')
for s in 'ha': df['shift'+s]=df['pp'+s]-df['pp_l10'+s]; df['k'+s]=df['k'+s]; df['rest'+s]=df['rest'+s].clip(upper=8)
base=['r','seed','pp','cen','dev','pos','neg','top','n','miss','rest','k','shift','oracle']
perside=[c for c in base if c!='oracle']+hist
cols=[c+s for c in perside for s in 'ha']+['d','playoff','he','e4','extra']
mcols=cols+[c+s for c in mk for s in 'ha']
v=df[df.vegas.notna()&(df.season<'2026')].copy()
def flip(d,cs):
    f=d.copy()
    for c in cs:
        if c.endswith('h') and c[:-1]+'a' in d: f[c]=d[c[:-1]+'a']; f[c[:-1]+'a']=d[c]
    f['e4']=-d.e4+2*d.he*0; f['extra']=-d.extra; f['tgt']=-d.tgt; f['flip']=1; return f
def run(cs,target,label):
    out=[]
    for s in sorted(v.season.unique())[3:]:
        tr=v[v.season<s].copy(); te=v[v.season==s].copy()
        tr['tgt']=target(tr); tr['flip']=0
        m=lgb.LGBMRegressor(n_estimators=400,learning_rate=0.02,num_leaves=15,min_child_samples=40,subsample=0.8,subsample_freq=1,colsample_bytree=0.7,reg_lambda=5,verbose=-1)
        m.fit(tr[cs],tr.tgt)
        adj=m.predict(te[cs]); p=norm.cdf((te.e4+adj)/te.sig)
        out.append(pd.DataFrame({'season':s,'grp':te.grp,'l':ll(p,te.y),'kl':klp(te,p),'l4':te.l4,'kl4':te.kl4,'lv':te.lv,'adj':adj,'dv':te.dv}))
    o=pd.concat(out); r2=1-((o.dv-o.adj)**2).sum()/((o.dv-o.dv.mean())**2).sum()
    print(f'{label:38s} R2(dv) {r2:.3f} | KL {o.kl.mean():.4f} (v4 {o.kl4.mean():.4f}) | logloss {o.l.mean():.4f} v4 {o.l4.mean():.4f} vegas {o.lv.mean():.4f} | by grp d_ll:',(o.l-o.l4).groupby(o.grp).mean().round(4).to_dict())
    return m
m1=run(cols,lambda d:d.dv,'learn Vegas, our features')
m2=run(mcols,lambda d:d.dv,'learn Vegas, + its earlier lines')
m3=run(cols,lambda d:d.res,'learn results (noisy target)')
imp=pd.Series(m1.booster_.feature_importance('gain'),index=cols).sort_values(ascending=False); print((imp/imp.sum()).head(16).round(3).to_dict())
df.to_pickle(S+'/df3.pkl')
