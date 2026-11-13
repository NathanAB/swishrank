import sys, json, numpy as np, pandas as pd, warnings
warnings.filterwarnings('ignore')
S=sys.argv[1]
df=pd.read_pickle(S+'/df3.pkl')
names=json.load(open('src/data/players.json'))
v=df[df.vegas.notna()&(df.season<'2026')&(df.season>='2019')].copy()
v['maxmiss']=np.maximum(v.missh,v.missa); v['maxshift']=np.maximum(abs(v.shifth),abs(v.shifta))
v['dv2']=v.dv**2
print('share of all squared disagreement by missing minutes (48ths) on the worse-hit side:')
b=pd.cut(v.maxmiss,[-0.01,0.001,0.5,1,1.5,2,6])
t=v.groupby(b,observed=True).agg(n=('dv2','size'),rms_dv=('dv2',lambda x:np.sqrt(x.mean())),kl=('kl4','mean'),sum2=('dv2','sum')); t['share_dv2']=t.sum2/t.sum2.sum(); t['share_games']=t.n/t.n.sum(); print(t.drop(columns='sum2').round(3))
# Who was actually absent: players in prev lineup not in actual box, by value; and stars who played but were not priced
def absent(row,s):
    prev={int(p[0]):(p[1],p[2]) for p in row['prev'+s]}; act={int(p[0]):p[1] for p in row['act'+s]}; lu={int(p[0]):p[1] for p in row['lu'+s]}
    wrong_in=sum(sh for a,sh in lu.items() if a not in act)          # priced but did not play
    wrong_out=sum(m/48 for a,m in act.items() if a not in lu and m>=15)   # played 15+ but not priced
    return wrong_in,wrong_out
for s in 'ha':
    r=[absent(x,s) for _,x in v.iterrows()]; v['win'+s]=[a for a,_ in r]; v['wout'+s]=[b for _,b in r]
v['wrong']=v.winh+v.wina+v.wouth+v.wouta
b=pd.cut(v.wrong,[-0.01,0.2,0.6,1,1.5,2.5,10])
t=v.groupby(b,observed=True).agg(n=('dv2','size'),rms_dv=('dv2',lambda x:np.sqrt(x.mean())),kl=('kl4','mean'),klOr=('klOr','mean'),sum2=('dv2','sum')); t['share_dv2']=t.sum2/t.sum2.sum(); t['share_games']=t.n/t.n.sum()
print('by lineup the model priced wrongly (shares of 48 min: priced but sat + played 15+ but unpriced):'); print(t.drop(columns='sum2').round(3))
print('mean wrong by phase', v.groupby(pd.cut(v.d,[-1,14,140,175,400]),observed=True).wrong.mean().round(2).to_dict())
# eyeball the biggest disagreements, mid-season regular games
nm=lambda a: names.get(str(int(a)),str(a))
top=v[(v.d>30)&(v.d<140)].reindex(v.dv.abs().sort_values(ascending=False).index).dropna(subset=['id']).head(14)
for _,x in top.iterrows():
    sat=lambda s:[nm(p[0]) for p in x['lu'+s] if int(p[0]) not in {int(q[0]) for q in x['act'+s]}]
    new=lambda s:[nm(q[0]) for q in x['act'+s] if q[1]>=15 and int(q[0]) not in {int(p[0]) for p in x['lu'+s]}]
    print(f"{x.day} {x.away}@{x.home} model {x.p4:.2f} vegas {x.vegas:.2f} final {x['as']}-{x.hs} | priced-but-sat H{sat('h')} A{sat('a')} | unpriced-played H{new('h')} A{new('a')}")
