import sys, numpy as np, pandas as pd, warnings
warnings.filterwarnings('ignore')
from scipy.stats import norm
from sklearn.linear_model import Ridge
S=sys.argv[1]
df=pd.read_pickle(S+'/df3.pkl').sort_values(['t','id']).reset_index(drop=True)
v=df[df.vegas.notna()&(df.season<'2026')].reset_index(drop=True)
def klp(d,q):
    a=d.vegas.astype(float).clip(0.005,0.995); q=np.clip(q,1e-9,1-1e-9); return (a*np.log(a/q)+(1-a)*np.log((1-a)/(1-q)))
ll=lambda p,y: -(y*np.log(np.clip(p,1e-12,1))+(1-y)*np.log(np.clip(1-p,1e-12,1)))
k=np.minimum(v.kh,v.ka)
v['phase']=np.select([v.playoff==1,k<5,k<10,k<20,v.d>140],['po','k0','k5','k10','late'],'mid')
F=pd.DataFrame({'team':v.rh-v.ra,'seed':v.seedh-v.seeda,'prior':v.cenh-v.cena,'learned':v.devh-v.deva,'home':v.he,'b2b':v.b2ba.astype(int)-v.b2bh.astype(int),'extra':v.extra,
                'form10':(v.res_l10h.fillna(0)-v.res_l10a.fillna(0)),'rest':(v.resth.clip(upper=4)-v.resta.clip(upper=4))})
def run(cols,label,byphase,target):
    out=[]; last={}
    for s in sorted(v.season.unique())[3:]:
        for ph in (v.phase.unique() if byphase else ['all']):
            trm=(v.season<s)&((v.phase==ph)|(not byphase)); tem=(v.season==s)&((v.phase==ph)|(not byphase))
            if tem.sum()==0: continue
            m=Ridge(alpha=1e-3,fit_intercept=False).fit(F.loc[trm,cols],target[trm]); last[ph]=dict(zip(cols,m.coef_.round(2)))
            t=v[tem]; p=norm.cdf(m.predict(F.loc[tem,cols])/t.sig); out.append(pd.DataFrame({'grp':t.grp,'ph':t.phase,'l':ll(p,t.y),'kl':klp(t,p),'l4':t.l4,'kl4':t.kl4}))
    o=pd.concat(out); print(f'{label:46s} KL {o.kl.mean():.4f} (v4 {o.kl4.mean():.4f}) | logloss {o.l.mean():.4f} (v4 {o.l4.mean():.4f}) | d_ll',(o.l-o.l4).groupby(o.grp).mean().round(4).to_dict(),'| d_ll by phase',(o.l-o.l4).groupby(o.ph).mean().round(4).to_dict())
    return last
base=['team','seed','prior','learned','home','b2b','extra']
zt=(v.zv*v.sig)
run(base,'reweight parts, one set, taught by Vegas',False,zt)
c=run(base,'reweight parts by phase, taught by Vegas',True,zt)
run(base+['form10','rest'],'  + last-10 form and rest',True,zt)
run(base,'reweight parts by phase, taught by results',True,v.cm)
for ph,co in c.items(): print(ph,co)
