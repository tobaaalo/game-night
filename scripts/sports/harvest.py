"""Harvest sports stars (with free Commons image + fame score) from Wikidata, by league."""
import json,subprocess,urllib.parse,urllib.request,time,sys,re,unicodedata
UA="GameNightApp/1.0 (https://github.com/tobaaalo/game-night; photo quiz)"
def sparql(q):
    for i in range(5):
        try:
            u="https://query.wikidata.org/sparql?format=json&query="+urllib.parse.quote(q)
            return json.load(urllib.request.urlopen(urllib.request.Request(u,headers={"User-Agent":UA}),timeout=120))["results"]["bindings"]
        except Exception as e:
            print("retry",repr(e)[:80],file=sys.stderr); time.sleep(15)
    return []
G={ # key: (sport, league tag, where-clause)
 "EPL":("football","EPL","?p wdt:P106 wd:Q937857; wdt:P54 ?t. ?t wdt:P118 wd:Q9448."),
 "LaLiga":("football","LaLiga","?p wdt:P106 wd:Q937857; wdt:P54 ?t. ?t wdt:P118 wd:Q324867."),
 "SerieA":("football","SerieA","?p wdt:P106 wd:Q937857; wdt:P54 ?t. ?t wdt:P118 wd:Q15804."),
 "Ligue1":("football","Ligue1","?p wdt:P106 wd:Q937857; wdt:P54 ?t. ?t wdt:P118 wd:Q13394."),
 "Bundesliga":("football","Bundesliga","?p wdt:P106 wd:Q937857; wdt:P54 ?t. ?t wdt:P118 wd:Q82595."),
 "Intl":("football","Other","?p wdt:P106 wd:Q937857; wdt:P54 ?t. ?t wdt:P31 wd:Q6979593."),
 "NBA":("basketball","NBA","?p wdt:P106 wd:Q3665646; wdt:P54 ?t. ?t wdt:P118 wd:Q155223."),
 "NFL":("nfl","NFL","?p wdt:P106 wd:Q19204627; wdt:P54 ?t. ?t wdt:P118 ?d. ?d wdt:P361* wd:Q1215884."),
 "Tennis":("tennis","ATP","?p wdt:P106 wd:Q10833314."),
}
MINSL={"NFL":12,"NBA":22}
LIM={"EPL":420,"LaLiga":300,"SerieA":300,"Ligue1":220,"Bundesliga":200,"Intl":300,"NBA":420,"NFL":320,"Tennis":380}
out={}
for k,(sport,lg,w) in G.items():
    if len(sys.argv)>1 and k not in sys.argv[1:]: continue
    q=f"""SELECT ?p ?pLabel ?sl ?img ?dob ?sex WHERE {{ {{ SELECT DISTINCT ?p ?sl ?img WHERE {{ {w} ?p wdt:P18 ?img; wikibase:sitelinks ?sl. FILTER(?sl>={MINSL.get(k,28)}) }} ORDER BY DESC(?sl) LIMIT {LIM[k]} }}
      OPTIONAL {{ ?p wdt:P569 ?dob }} OPTIONAL {{ ?p wdt:P21 ?sex }} SERVICE wikibase:label {{ bd:serviceParam wikibase:language "en". }} }}"""
    rows=sparql(q); print(k,len(rows),file=sys.stderr)
    for r in rows:
        qid=r["p"]["value"].rsplit("/",1)[1]; name=r["pLabel"]["value"]
        if re.fullmatch(r"Q\d+",name): continue
        e=out.setdefault(qid,dict(qid=qid,name=name,sl=int(r["sl"]["value"]),img=urllib.parse.unquote(r["img"]["value"].rsplit("/",1)[1]),dob=r.get("dob",{}).get("value","")[:4].lstrip("-"),sex=r.get("sex",{}).get("value","").rsplit("/",1)[-1],sports=[],leagues=[]))
        if sport not in e["sports"]: e["sports"].append(sport)
        if lg not in e["leagues"]: e["leagues"].append(lg)
    time.sleep(5)
import os
old=json.load(open("cand.json")) if os.path.exists("cand.json") and len(sys.argv)>1 else []
for o in old:
    out.setdefault(o["qid"],o)
json.dump(list(out.values()),open("cand.json","w"),ensure_ascii=False)
print(len(out))
