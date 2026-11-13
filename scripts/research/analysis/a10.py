import sys, json, numpy as np, pandas as pd, warnings
warnings.filterwarnings('ignore')
from scipy.stats import norm
from scipy import sparse
from sklearn.linear_model import Ridge
S=sys.argv[1]
names=json.load(open('src/data/players.json'))
df=pd.read_pickle(S+'/df3.pkl').sort_values(['t','id']).reset_index(drop=True)
v=df[df.vegas.notna()&(df.season<'2026')].reset_index(drop=True)
def klp(d,q):
    a=d.vegas.astype(float).clip(0.005,0.995); q=np.clip(q,1e-9,1-1e-9); return (a*np.log(a/q)+(1-a)*np.log((1-a)/(1-q)))
ll=lambda p,y: -(y*np.log(np.clip(p,1e-12,1))+(1-y)*np.log(np.clip(1-p,1e-12,1)))
ids={}; teams={}
r,c,d=[],[],[]
for i,g in v.iterrows():
    for lu,sg in ((g.luh,1),(g.lua,-1)):
        for a,sh,_,_ in lu:
            j=ids.setdefault(int(a),len(ids)); r.append(i); c.append(j); d.append(sg*sh)
Xp=sparse.csr_matrix((d,(r,c)),shape=(len(v),len(ids)))
# home-team and team columns: Vegas' view of each team's home edge / strength, beyond ours
tix={t:k for k,t in enumerate(sorted(set(v.home)))}
Xh=sparse.csr_matrix((np.ones(len(v))*(~v.neutral),(np.arange(len(v)),v.home.map(tix))),shape=(len(v),len(tix)))
seasons=sorted(v.season.unique())
def run(X,label,alpha,target='dv',years=99):
    out=[]
    for s in seasons[3:]:
        tr=np.where((v.season<s)&(v.season>=seasons[max(0,seasons.index(s)-years)]))[0]; te=np.where(v.season==s)[0]
        m=Ridge(alpha=alpha,fit_intercept=False).fit(X[tr],v[target].values[tr]); adj=m.predict(X[te]); t=v.iloc[te]
        p=norm.cdf((t.e4+adj)/t.sig); out.append(pd.DataFrame({'grp':t.grp,'l':ll(p,t.y),'kl':klp(t,p),'l4':t.l4,'kl4':t.kl4,'adj':adj,'dv':t.dv}))
    o=pd.concat(out); r2=1-((o.dv-o.adj)**2).sum()/((o.dv)**2).sum()
    print(f'{label:52s} R2(dv) {r2:.3f} | KL {o.kl.mean():.4f} (v4 {o.kl4.mean():.4f}) | logloss {o.l.mean():.4f} (v4 {o.l4.mean():.4f}) | d_ll',(o.l-o.l4).groupby(o.grp).mean().round(4).to_dict())
    return m
for a in (3,10,30): m=run(Xp,f'player corrections from earlier seasons Vegas, ridge {a}',a)
run(Xp,'  same, last 2 seasons only',10,years=2)
run(Xp,'  same, learned from results instead',30,target='res')
run(Xh,'home edge by team from earlier seasons Vegas',5)
run(Xh,'  same, last 3 seasons',5,years=3)
# who: latest fit's biggest corrections among players with real minutes
m=Ridge(alpha=10,fit_intercept=False).fit(Xp,v.dv.values); w=np.asarray(abs(Xp).sum(0)).ravel()
co=pd.DataFrame({'name':[names.get(str(a),str(a)) for a in ids],'corr':m.coef_,'w':w}); co=co[co.w>150].sort_values('corr')
print('Vegas rates lower than model:',', '.join(f"{x.name} {x['corr']:+.2f}" for _,x in co.head(14).iterrows()))
print('Vegas rates higher than model:',', '.join(f"{x.name} {x['corr']:+.2f}" for _,x in co.tail(14).iloc[::-1].iterrows()))
hm=Ridge(alpha=5,fit_intercept=False).fit(Xh,v.dv.values); print('home-edge corrections:',dict(sorted(zip(tix,hm.coef_.round(2)),key=lambda x:x[1])))
