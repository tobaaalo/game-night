import json,os,re,sys,time,unicodedata,urllib.parse,urllib.request,urllib.error
UA="GameNightApp/1.0 (https://github.com/tobaaalo/game-night; party game photo credits)"
ROOT="/home/claude/game-night"
FREE=re.compile(r'^(CC[ -]BY|CC0|Public domain|PD|Attribution|GFDL|Copyrighted free use|No restrictions)',re.I)
def get(url,binary=False):
    for i in range(8):
        try:
            d=urllib.request.urlopen(urllib.request.Request(url,headers={"User-Agent":UA}),timeout=40).read()
            return d if binary else json.loads(d)
        except urllib.error.HTTPError as e:
            if e.code in(429,503):
                w=int(e.headers.get('retry-after') or 30)+3; print('wait',w,flush=True); time.sleep(w); continue
            if e.code==404: return None
            time.sleep(3)
        except Exception: time.sleep(4)
def slug(s):
    s=unicodedata.normalize('NFKD',s).encode('ascii','ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+','-',s).strip('-')
def norm(s): return slug(s)
sp=json.load(open(ROOT+"/src/content/sports.json")); fc=json.load(open(ROOT+"/src/content/faces.json"))
have={norm(x['name']) for x in sp+fc}|{x['id'] for x in sp+fc}
cand=json.load(open("cand.json"))
rows=[];seen=set()
for c in sorted(cand,key=lambda c:-c['sl']):
    pid=slug(c['name'])
    if not pid or pid in have or pid in seen: continue
    seen.add(pid); c['pid']=pid; rows.append(c)
print('candidates',len(rows),flush=True)
out=json.load(open("new_sports.json")) if os.path.exists("new_sports.json") else []
done={x['id'] for x in out}
log=open("fetch.log","a")
rows=[r for r in rows if r['pid'] not in done]
for i in range(0,len(rows),40):
    b=rows[i:i+40]
    r=get("https://commons.wikimedia.org/w/api.php?"+urllib.parse.urlencode(dict(action="query",format="json",formatversion=2,titles="|".join("File:"+x['img'] for x in b),prop="imageinfo",iiprop="url|size|extmetadata",iiurlheight=600)))
    info={}
    for p in r["query"]["pages"]:
        if 'imageinfo' not in p: continue
        ii=p['imageinfo'][0]; md=ii.get('extmetadata',{})
        info[p['title'][5:].replace('_',' ')]=dict(url=ii.get('thumburl') or ii['url'],w=ii.get('thumbwidth',ii['width']),h=ii.get('thumbheight',ii['height']),ow=ii['width'],oh=ii['height'],lic=md.get('LicenseShortName',{}).get('value',''))
    time.sleep(1.5)
    for c in b:
        m=info.get(c['img'].replace('_',' '))
        if not m: print('NOCOMMONS',c['name'],file=log); continue
        if not FREE.match(m['lic']): print('LICENSE',c['name'],m['lic'],file=log); continue
        if m['oh']<400 or m['ow']<250: print('SMALL',c['name'],file=log); continue
        if not re.search(r'\.(jpe?g)$',c['img'],re.I) and not m['url'].lower().split('?')[0].endswith(('.jpg','.jpeg','.png')): print('FMT',c['name'],file=log); continue
        d=get(m['url'],True)
        if not d: print('DL',c['name'],file=log); continue
        from PIL import Image; import io
        try: im=Image.open(io.BytesIO(d)).convert("RGB")
        except Exception: print('BAD',c['name'],file=log); continue
        im.save(f"{ROOT}/public/faces/{c['pid']}.jpg",quality=85,optimize=True)
        out.append(dict(id=c['pid'],name=c['name'],w=im.width,h=im.height,src=c['img'].replace(' ','_'),lic=m['lic'],sl=c['sl'],dob=c['dob'],sex=c['sex'],sports=c['sports'],leagues=c['leagues']))
        print('ok',c['name'],m['lic'],file=log); log.flush()
        json.dump(out,open("new_sports.json","w"),ensure_ascii=False); time.sleep(0.6)
    print('progress',i+40,'of',len(rows),'kept',len(out),flush=True)
print('DONE',len(out),flush=True)
