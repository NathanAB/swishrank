# Roster-based lineup projection, against version 4's previous-game rule. Judged on minutes actually played and on results.
import sys, json, numpy as np, pandas as pd, warnings, collections
warnings.filterwarnings('ignore')
from scipy.stats import norm
from scipy.optimize import minimize_scalar
S,REPDIR=sys.argv[1],sys.argv[2]
g=pd.DataFrame(json.load(open(S+'/games2.json'))).sort_values(['t','id']).reset_index(drop=True)
g=g[g.season<'2026'].reset_index(drop=True)
rep={}
for s in sorted(g.season.unique()):
    try: rep.update(json.load(open(f'{REPDIR}/{s}.json'))['games'])
    except FileNotFoundError: pass
TRAIN=lambda s: '2019-20'<=s<='2022-23'
W=10
def sbucket(k): return 0 if k==0 else 1 if k==1 else 2 if k==2 else 3 if k<=5 else 4
def mbucket(b): return 0 if b<10 else 1 if b<18 else 2 if b<26 else 3
# pass 1: candidates and what happened
last_team={}; apps=collections.defaultdict(list); team_games=collections.defaultdict(list)
recs=[]; per_game={}
for gi,x in g.iterrows():
    r=rep.get(x.id)
    for s,abbr in (('h',x.home),('a',x.away)):
        sr=(r or {}).get('home' if s=='h' else 'away')
        covered=sr is not None
        hist=team_games[(x.season,abbr)][-W:]
        cands={}
        for back,gm in enumerate(reversed(hist)):
            for a in gm:
                if a not in cands and last_team.get(a)==abbr: cands[a]=None
        for a,st in (sr or {}).items():
            a=int(a)
            if a not in cands and st in ('Available','Probable','Questionable') and a in apps: cands[a]=None
        act={int(a):m for a,m,_,_ in x['act'+s]}
        tot=sum(act.values()) or 240
        rows=[]
        for a in cands:
            streak=0
            for gm in reversed(hist):
                if a in gm: break
                streak+=1
            mins=apps[a][-5:]; base=float(np.mean(mins)) if mins else 15.0
            status=(sr or {}).get(str(a),'unlisted') if covered else 'uncovered'
            played=a in act
            rows.append([a,base,streak,status,played,act.get(a,0)*240/tot])
            if act: recs.append((x.season,status,sbucket(streak),mbucket(base),played,(act.get(a,0)*240/tot)/max(base,1) if played else np.nan,base))
        per_game[(x.id,s)]=(rows,act,tot)
    for s,abbr in (('h',x.home),('a',x.away)):
        act={int(a):m for a,m,_,_ in x['act'+s]}
        if act:
            team_games[(x.season,abbr)].append(act)
            for a,m in act.items(): apps[a].append(m); last_team[a]=abbr
R=pd.DataFrame(recs,columns=['season','status','sb','mb','played','ratio','base'])
tr=R[R.season.map(TRAIN)]
P=tr.groupby(['status','sb','mb']).played.agg(['mean','size'])
P2=tr.groupby(['status','sb']).played.mean(); P1=tr.groupby('status').played.mean()
M=tr[tr.played].groupby(['status','sb']).ratio.agg(['mean','size']); M1=tr[tr.played].groupby('status').ratio.mean()
print('P(plays) by status and games missed in a row (0,1,2,3-5,6+), players with 18+ expected minutes, 2019-23:')
print(tr[tr.mb>=2].groupby(['status','sb']).played.mean().unstack().round(2).to_string())
print('counts:'); print(tr[tr.mb>=2].groupby(['status','sb']).size().unstack().to_string())
def prob(st,sb,mb):
    k=(st,sb,mb)
    if k in P.index and P.loc[k,'size']>=40: return P.loc[k,'mean']
    return P2.get((st,sb),P1.get(st,0.5))
def mult(st,sb):
    k=(st,sb)
    if k in M.index and M.loc[k,'size']>=40: return M.loc[k,'mean']
    return M1.get(st,1.0)
out=[]
for gi,x in g.iterrows():
    row={'id':x.id}
    for s in 'ha':
        rows,act,tot=per_game[(x.id,s)]
        val=dict((int(a),v) for a,v in x['val'+s])
        if not rows: row['pp'+s]=np.nan; row['miss'+s]=0; continue
        em={a:prob(st,sbucket(k),mbucket(b))*mult(st,sbucket(k))*b for a,b,k,st,_,_ in rows}
        tote=sum(em.values()) or 1
        em={a:m*240/tote for a,m in em.items()}
        row['pp'+s]=sum(m/48*val.get(a,0) for a,m in em.items())
        reg=[(b,prob(st,sbucket(k),mbucket(b))) for a,b,k,st,_,_ in rows if b>=10 and k<=1]
        row['miss'+s]=5*sum(b*(1-p) for b,p in reg)/max(sum(b for b,_ in reg),1)
        if act:
            a240={a:m*240/tot for a,m in act.items()}; ids=set(a240)|set(em)
            row['abs'+s]=sum(abs(em.get(a,0)-a240.get(a,0)) for a in ids)/2
            row['verr'+s]=sum((em.get(a,0)-a240.get(a,0))/48*val.get(a,0) for a in ids)
            v4={int(a):sh*48 for a,sh,_,_ in x['lu'+s] if a>0}; ids=set(a240)|set(v4)
            row['abs4'+s]=sum(abs(v4.get(a,0)-a240.get(a,0)) for a in ids)/2
            row['verr4'+s]=sum((v4.get(a,0)-a240.get(a,0))/48*val.get(a,0) for a in ids)
    out.append(row)
o=pd.DataFrame(out).set_index('id'); d=g.set_index('id').join(o,rsuffix='_new')
d=d[(d.season>='2019-20')]
d['y']=(d.hs>d['as']).astype(int); d['cm']=np.sign(d.hs-d['as'])*np.sqrt(abs(d.hs-d['as'])+3)
k=np.minimum(d.kh,d.ka); d['grp']=np.where(d.season<='2022-23','2019-23 (rates set here)','2023-26 (held out)')
d['wk']=d.season+':'+(d.d//7).astype(str)
ll=lambda p,y: -(y*np.log(np.clip(p,1e-12,1))+(1-y)*np.log(np.clip(1-p,1e-12,1)))
def boot(x,blk,n=2000):
    t=pd.DataFrame({'x':x,'b':blk}).groupby('b').x.agg(['sum','count']).values; r=np.random.default_rng(7); i=r.integers(0,len(t),(n,len(t))); m=t[i,0].sum(1)/t[i,1].sum(1); return np.percentile(m,2.5),np.percentile(m,97.5)
print('\nminutes misplaced per team-game (of 240) and value error (rms, margin units):')
for grp,q in d.groupby('grp'):
    a4=pd.concat([q.abs4h,q.abs4a]).mean(); an=pd.concat([q.absh,q.absa]).mean(); v4=np.sqrt((pd.concat([q.verr4h,q.verr4a])**2).mean()); vn=np.sqrt((pd.concat([q.verrh,q.verra])**2).mean())
    print(f'  {grp}: minutes v4 {a4:.1f} -> new {an:.1f};  value error v4 {v4:.3f} -> new {vn:.3f}')
tr=d.season<='2022-23'
def score(e,label):
    sig=minimize_scalar(lambda s: ll(norm.cdf(e[tr]/s),d.y[tr]).mean(),bounds=(1.5,5),method='bounded').x
    p=norm.cdf(e/np.where(k<5,sig*1.14,sig)); p4=norm.cdf(d.e4/np.where(k<5,2.986*1.14,2.986))
    line=f'{label:34s} sigma {sig:.3f} |'
    for grp,q in d.groupby('grp'):
        m=(d.grp==grp).values; dl=(ll(p,d.y)-ll(p4,d.y))[m]; lo,hi=boot(dl.values,d.wk[m].values); dm=((d.cm-e)**2-(d.cm-d.e4)**2)[m]; lo2,hi2=boot(dm.values,d.wk[m].values)
        line+=f' {grp[:7]}: log loss {dl.mean():+.4f} [{lo:+.4f},{hi:+.4f}] margin err {dm.mean():+.4f} [{lo2:+.4f},{hi2:+.4f}] |'
    print(line)
base=d.e4-d.extra-(d.pph-d.ppa)
ppn=(d.pph_new.fillna(d.pph)-d.ppa_new.fillna(d.ppa))
print('\nagainst version 4 as backtested (negative is better):')
for f in (0,-0.15,-0.3,-0.45): score(base+ppn+f*(d.missh_new-d.missa_new),f'roster-based, fill {f}')
score(base+(d.pph-d.ppa)+d.extra,'check: v4 rebuilt (should be 0)')
