import sys, numpy as np, pandas as pd
from scipy.stats import norm
import statsmodels.api as sm
S=sys.argv[1]
df=pd.read_pickle(S+'/df.pkl').sort_values(['t','id']).reset_index(drop=True)
df['cm']=np.sign(df.m)*np.sqrt(abs(df.m)+3)
def klp(d,q):
    a=d.vegas.astype(float).clip(0.005,0.995); q=np.clip(q,1e-9,1-1e-9); return (a*np.log(a/q)+(1-a)*np.log((1-a)/(1-q)))
ll=lambda p,y: -(y*np.log(np.clip(p,1e-12,1))+(1-y)*np.log(np.clip(1-p,1e-12,1)))
def feats(lu):
    if not len(lu): return dict(pos=0,neg=0,sq=0,cen=0,dev=0,top=0,n=0)
    a=np.array(lu,float); sh,v,c=a[:,1],a[:,2],a[:,3]
    return dict(pos=(sh*np.maximum(v,0)).sum(),neg=(sh*np.minimum(v,0)).sum(),sq=(sh*v*abs(v)).sum(),cen=(sh*c).sum(),dev=(sh*(v-c)).sum(),top=(sh*v).max(),n=len(a))
def act(al):
    if not len(al): return np.nan
    a=np.array(al,float); return (a[:,1]/a[:,1].sum()*5*a[:,2]).sum()
for s in 'ha':
    f=pd.DataFrame([feats(x) for x in df['lu'+s]]); f.columns=[c+s for c in f.columns]; df=pd.concat([df,f],axis=1)
    df['oracle'+s]=[act(x) for x in df['act'+s]]
df['eOr']=df.e4-df.extra-(df.pph-df.ppa)+(df.oracleh.fillna(df.pph)-df.oraclea.fillna(df.ppa))
df['pOr']=norm.cdf(df.eOr/df.sig); df['klOr']=klp(df,df.pOr); df['lOr']=ll(df.pOr,df.y)
v=df[df.vegas.notna()&(df.season<'2026')].copy()
v['ph']=pd.cut(v.d,[-1,14,140,175,400],labels=['first2wk','mid','last5wk','playoffs'])
print(v.groupby('ph',observed=True).agg(n=('y','size'),kl_v4=('kl4','mean'),kl_whoPlayed=('kltip','mean'),kl_actualMinutes=('klOr','mean'),ll_v4=('l4','mean'),ll_actualMin=('lOr','mean'),ll_vegas=('lv','mean')).round(4))
print('all:',v[['kl4','kltip','klOr','l4','lOr','lv']].mean().round(4).to_dict())
# does Vegas (and the result) weight our player parts differently by kind?
X=pd.DataFrame({'team':v.rh-v.ra,'seed':v.seedh-v.seeda,'pos':v.posh-v.posa,'neg':v.negh-v.nega,'b2b':v.b2ba.astype(int)-v.b2bh.astype(int),'extra':v.extra,'home':(~v.neutral).astype(int)})
for name,yv in [('vegas',v.zv*v.sig),('result',v.cm)]:
    m=sm.OLS(yv,X).fit(); print(name,{k:(round(m.params[k],2),round(m.bse[k],2)) for k in X})
X2=pd.DataFrame({'team':v.rh-v.ra,'prior':v.cenh-v.cena,'learned':v.devh-v.deva,'b2b':v.b2ba.astype(int)-v.b2bh.astype(int),'extra':v.extra,'home':(~v.neutral).astype(int)})
for name,yv in [('vegas',v.zv*v.sig),('result',v.cm)]:
    m=sm.OLS(yv,X2).fit(); print(name,{k:(round(m.params[k],2),round(m.bse[k],2)) for k in X2})
X3=X2.assign(sq=v.sqh-v.sqa)
for name,yv in [('vegas',v.zv*v.sig),('result',v.cm)]:
    m=sm.OLS(yv,X3).fit(); print(name,{k:(round(m.params[k],2),round(m.bse[k],2)) for k in X3})
# by phase: slopes of vegas on team vs players
for ph,d in v.groupby('ph',observed=True):
    Xp=pd.DataFrame({'team':d.rh-d.ra,'players':d.pph-d.ppa,'home':(~d.neutral).astype(int),'extra':d.extra})
    m=sm.OLS(d.zv*d.sig,Xp).fit(); m2=sm.OLS(d.cm,Xp).fit(); print(ph,'vegas',m.params.round(2).to_dict(),'| result',m2.params.round(2).to_dict(),m2.bse.round(2).to_dict())
df.to_pickle(S+'/df2.pkl')
