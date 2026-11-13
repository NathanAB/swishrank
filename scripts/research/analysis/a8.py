import sys, numpy as np, pandas as pd, warnings, statsmodels.api as sm
warnings.filterwarnings('ignore')
S=sys.argv[1]
df=pd.read_pickle(S+'/df3.pkl')
v=df[df.vegas.notna()&(df.season<'2026')].copy()
v['Dew']=(v.dv_ewh.fillna(0)-v.dv_ewa.fillna(0))
# persistent part: prediction of dv from the two teams' earlier lines (fitted on all, 1 param); idiosyncratic = the rest
b=sm.OLS(v.dv,v[['Dew']]).fit().params['Dew']; v['P']=b*v.Dew; v['I']=v.dv-v.P
print('rms dv %.3f  persistent %.3f  one-game %.3f (model units; 1 unit ~ 4.4 points)'%(np.sqrt((v.dv**2).mean()),v.P.std(),v.I.std()))
m=sm.OLS(v.cm-v.e4,v[['P','I']]).fit(); print('result miss on Vegas parts: ',m.params.round(3).to_dict(),'se',m.bse.round(3).to_dict())
for lab,d in [('first2wk',v[v.d<=14]),('mid',v[(v.d>14)&(v.d<=140)]),('last5wk',v[(v.d>140)&(v.d<=175)]),('playoffs',v[v.d>175])]:
    m=sm.OLS(d.cm-d.e4,d[['P','I']]).fit(); print(' ',lab,m.params.round(2).to_dict(),m.bse.round(2).to_dict())
# is the one-game part bigger for late tips (report snapshot is 5 PM ET at the latest in the history)?
v['hourET']=(pd.to_datetime(v.t).dt.tz_convert('America/New_York').dt.hour)
print(v.groupby(pd.cut(v.hourET,[0,16,19,20,21,24]),observed=True).agg(n=('I','size'),rms_I=('I',lambda x:np.sqrt((x**2).mean())),kl=('kl4','mean')).round(4))
# which sign: does Vegas' one-game part line up with lineup facts we lacked? actual-players oracle shift
v['orShift']=(v.eOr-(v.e4-v.extra))
m=sm.OLS(v.I,sm.add_constant(v[['orShift']])).fit(); print('one-game part on (actual-minutes lineup − priced lineup):',m.params.round(3).to_dict(),'R2',round(m.rsquared,3))
