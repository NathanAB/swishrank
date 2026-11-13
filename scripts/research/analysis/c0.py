# Baseline: how wrong is version 4's priced lineup, measured against the minutes actually played?
import sys, json, numpy as np, pandas as pd, warnings
warnings.filterwarnings('ignore')
S=sys.argv[1]
g=pd.DataFrame(json.load(open(S+'/games2.json')))
g=g[(g.season>='2019-20')&(g.season<'2026')].reset_index(drop=True)
rows=[]
for _,x in g.iterrows():
    for s in 'ha':
        act={int(a):m for a,m,_,_ in x['act'+s]}
        if not act: continue
        tot=sum(act.values()); act={a:m*240/tot for a,m in act.items()}          # overtime scaled to 240
        proj={int(a):sh*48 for a,sh,_,_ in x['lu'+s] if a>0}
        val=dict((int(a),v) for a,v in x['val'+s])
        ids=set(act)|set(proj)
        err=sum(abs(proj.get(a,0)-act.get(a,0)) for a in ids)
        verr=sum((proj.get(a,0)-act.get(a,0))/48*val.get(a,0) for a in ids)
        rows.append((x.season,x.d,err,verr,sum(m for a,m in proj.items() if a not in act),sum(m for a,m in act.items() if a not in proj)))
r=pd.DataFrame(rows,columns=['season','d','abs_min','val_err','ghost','unpriced'])
print('version 4 priced lineups vs minutes played, per team-game (240 minutes):')
print(r.groupby('season').agg(n=('d','size'),minutes_misplaced=('abs_min',lambda x:x.mean()/2),to_absent_players=('ghost','mean'),played_by_unpriced=('unpriced','mean'),value_rms=('val_err',lambda x:np.sqrt((x**2).mean()))).round(2))
print('all: minutes misplaced %.1f of 240; value error rms %.3f margin units'%(r.abs_min.mean()/2,np.sqrt((r.val_err**2).mean())))
