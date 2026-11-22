"""Batch-fetch lead photos from Wikimedia Commons for people listed in people*.txt.
Line format: Wikipedia title | Display name | level | category | m/f
Keeps only free-licensed files hosted on Commons. Writes public/faces/<id>.jpg and new_faces.json."""
import sys,json,os,re,time,glob,urllib.parse,urllib.request,urllib.error,unicodedata
UA="GameNightApp/1.0 (https://github.com/tobaaalo/game-night; party game photo credits)"
ROOT="/home/claude/game-night"
def get(url,binary=False,retries=8):
    for i in range(retries):
        try:
            r=urllib.request.urlopen(urllib.request.Request(url,headers={"User-Agent":UA}),timeout=40)
            d=r.read(); return d if binary else json.loads(d)
        except urllib.error.HTTPError as e:
            if e.code in (429,503):
                w=int(e.headers.get('retry-after') or 30)+3; print('wait',w,flush=True); time.sleep(w); continue
            if e.code==404: return None
            if i==retries-1: raise
            time.sleep(3)
        except Exception:
            if i==retries-1: raise
            time.sleep(4)
def api(host,**kw):
    kw["format"]="json"
    return get(f"https://{host}/w/api.php?"+urllib.parse.urlencode(kw))
def slug(s):
    s=unicodedata.normalize('NFKD',s).encode('ascii','ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+','-',s).strip('-')
FREE=re.compile(r'^(CC[ -]BY|CC0|Public domain|PD|Attribution|GFDL|Copyrighted free use|No restrictions)',re.I)
def chunks(l,n):
    for i in range(0,len(l),n): yield l[i:i+n]
def main(files):
    faces=json.load(open(ROOT+"/src/content/faces.json"))
    have={x['id'] for x in faces}|{x['name'].lower() for x in faces}
    out=json.load(open('new_faces.json')) if os.path.exists('new_faces.json') else []
    have|={x['id'] for x in out}
    rows=[]
    for f in files:
        for ln in open(f):
            ln=ln.strip()
            if not ln or ln.startswith('#'): continue
            p=[x.strip() for x in ln.split('|')]
            title,disp,lv,cat,g=p[0],p[1] or p[0],int(p[2]),p[3],p[4]
            pid=slug(disp)
            if pid in have or disp.lower() in have: continue
            have.add(pid); rows.append(dict(title=title,disp=disp,lv=lv,cat=cat,g=g,pid=pid))
    log=open('fetch.log','a')
    for batch in chunks(rows,40):
        r=api("en.wikipedia.org",action="query",titles="|".join(b['title'] for b in batch),prop="pageimages",piprop="name",redirects=1,formatversion=2)
        q=r["query"]; norm={x['from']:x['to'] for x in q.get('normalized',[])}; red={x['from']:x['to'] for x in q.get('redirects',[])}
        pages={p['title']:p for p in q['pages']}
        files_for={}
        for b in batch:
            t=norm.get(b['title'],b['title']); t=red.get(t,t); pg=pages.get(t)
            if not pg or 'pageimage' not in pg: print('NOIMG',b['title'],file=log); continue
            files_for[b['pid']]=(b,pg['pageimage'])
        time.sleep(1.5)
        info={}
        fl=list({v[1] for v in files_for.values()})
        for fb in chunks(fl,40):
            r=api("commons.wikimedia.org",action="query",titles="|".join("File:"+x for x in fb),prop="imageinfo",iiprop="url|size|extmetadata",iiurlheight=600,formatversion=2)
            q=r["query"]; norm={x['from']:x['to'] for x in q.get('normalized',[])}
            for p in q['pages']:
                if 'imageinfo' not in p: continue
                ii=p['imageinfo'][0]; md=ii.get('extmetadata',{})
                info[p['title'][5:]]=dict(url=ii.get('thumburl') or ii['url'],w=ii.get('thumbwidth',ii['width']),h=ii.get('thumbheight',ii['height']),ow=ii['width'],oh=ii['height'],lic=md.get('LicenseShortName',{}).get('value',''))
            time.sleep(1.5)
        for pid,(b,fn) in files_for.items():
            i=info.get(fn.replace('_',' '))
            if not i: print('NOTCOMMONS',b['title'],fn,file=log); continue
            if not FREE.match(i['lic']): print('LICENSE',b['title'],fn,i['lic'],file=log); continue
            if i['oh']<400 or i['ow']<250: print('SMALL',b['title'],fn,i['ow'],i['oh'],file=log); continue
            try:
                data=get(i['url'],binary=True)
                if not data: print('DL404',b['title'],file=log); continue
                open(f"{ROOT}/public/faces/{pid}.jpg","wb").write(data)
                out.append(dict(id=pid,name=b['disp'],level=b['lv'],w=i['w'],h=i['h'],src=fn.replace(' ','_'),cat=b['cat'],g=b['g'],lic=i['lic']))
                print('ok',b['disp'],fn,i['lic'],file=log)
            except Exception as e: print('ERR',b['title'],repr(e)[:80],file=log)
            log.flush(); json.dump(out,open('new_faces.json','w'),ensure_ascii=False,indent=0); time.sleep(0.8)
        print('batch done',len(out),flush=True)
if __name__=='__main__': main(sys.argv[1:] or sorted(glob.glob('people*.txt')))
