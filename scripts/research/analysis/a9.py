import sys, json, numpy as np, pandas as pd, warnings
warnings.filterwarnings('ignore')
from scipy.stats import norm
from sklearn.linear_model import Ridge
S=sys.argv[1]
df=pd.read_pickle(S+'/df3.pkl').sort_values(['t','id']).reset_index(drop=True)
STATS=['PTS','FGM','FGA','FTM','FTA','OREB','DREB','AST','STL','BLK','TO','PF']
box={}
for s in sorted(df.season.unique()):
    box.update(json.load(open(f'src/data/box/{s}.json'))['games'])
HL=365.0; PM=400.0
tot={}; mins={}; last={}; gp={}
# league per-36 means as the prior level, updated season by season from the season before (first season: own)
def lg_mean(season):
    T=np.zeros(13); M=0
    for gid in df[df.season==season].id:
        for lines in box.get(gid,{}).values():
            for l in lines: a=np.array(l[2:],float); T[:12]+=a; T[12]+=a[0]-2*a[1]-a[3]; M+=l[1]
    return 36*T/M
seasons=sorted(df.season.unique()); means={s:lg_mean(s) for s in seasons}
prior={s:means[seasons[max(i-1,0)]] for i,s in enumerate(seasons)}
rows=[]
for _,g in df.iterrows():
    now=pd.Timestamp(g.day).value/8.64e13; pr=prior[g.season]
    def side(lu):
        F=np.zeros(16)
        for a,sh,_,_ in lu:
            a=int(a)
            if a in tot:
                f=0.5**((now-last[a])/HL); m=mins[a]*f; r=36*(tot[a]*f+pr*PM/36)/(m+PM); F[:13]+=sh*(r-pr); F[13]+=sh*PM/(m+PM); F[14]+=sh*np.log1p(m); F[15]+=sh*mpg[a]
            else: F[13]+=sh
        return F
    rows.append(np.concatenate([[g.id],side(g.luh)-side(g.lua)]) if False else (g.id,side(g.luh)-side(g.lua)))
    for lines in box.get(g.id,{}).values():
        for l in lines:
            a=l[0]; x=np.array(l[2:]+[l[2]-2*l[3]-l[5]],float)
            if a not in tot: tot[a]=np.zeros(13); mins[a]=0.0; last[a]=now
            f=0.5**((now-last[a])/HL); tot[a]=tot[a]*f+x; mins[a]=mins[a]*f+l[1]; last[a]=now
    if _==0: mpg={}
    for lines in box.get(g.id,{}).values():
        for l in lines: mpg[l[0]]=0.8*mpg.get(l[0],l[1])+0.2*l[1]
X=pd.DataFrame([r[1] for r in rows],index=[r[0] for r in rows],columns=STATS+['3PM','newness','logmin','mpg'])
df=df.set_index('id'); 
def klp(d,q):
    a=d.vegas.astype(float).clip(0.005,0.995); q=np.clip(q,1e-9,1-1e-9); return (a*np.log(a/q)+(1-a)*np.log((1-a)/(1-q)))
ll=lambda p,y: -(y*np.log(np.clip(p,1e-12,1))+(1-y)*np.log(np.clip(1-p,1e-12,1)))
v=df[df.vegas.notna()&(df.season<'2026')]
def run(cols,label,target='dv'):
    out=[]; coefs=[]
    for s in sorted(v.season.unique())[3:]:
        tr=v[v.season<s]; te=v[v.season==s]
        m=Ridge(alpha=1.0,fit_intercept=False).fit(X.loc[tr.index,cols],tr[target]); coefs.append(m.coef_)
        adj=m.predict(X.loc[te.index,cols]); p=norm.cdf((te.e4+adj)/te.sig)
        out.append(pd.DataFrame({'grp':te.grp,'l':ll(p,te.y),'kl':klp(te,p),'l4':te.l4,'kl4':te.kl4,'adj':adj,'dv':te.dv}))
    o=pd.concat(out); r2=1-((o.dv-o.adj)**2).sum()/((o.dv)**2).sum()
    print(f'{label:34s} R2(dv) {r2:.3f} | KL {o.kl.mean():.4f} (v4 {o.kl4.mean():.4f}) | logloss {o.l.mean():.4f} (v4 {o.l4.mean():.4f}) | d_ll by grp',(o.l-o.l4).groupby(o.grp).mean().round(4).to_dict())
    return pd.Series(coefs[-1],index=cols)
c=run(STATS+['3PM'],'box weights learned from Vegas')
c2=run(STATS+['3PM','newness','logmin','mpg'],'  + experience and minutes role')
run(STATS+['3PM','newness','logmin','mpg'],'  same, learned from results',target='res')
gs=dict(zip(STATS,[1,0.4,-0.7,0.4-0.4*0,-0.4,0.7,0.3,0.7,1,0.7,-1,-0.4])); gs['FTM']=0.4; 
print('Game Score weight (x0.08) vs Vegas-implied total weight per unit of per-36 rate:')
print(pd.DataFrame({'model':{k:0.08*gs.get(k,0) for k in c2.index},'vegas_adds':c2.round(4)}).assign(implied=lambda d:(d.model+d.vegas_adds).round(4)).T.round(3).to_string())
X.to_pickle(S+'/Xbox.pkl')
