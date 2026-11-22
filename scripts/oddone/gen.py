import sys,glob,json,random,collections,itertools
def load():
    cats={}
    for f in sorted(glob.glob('cats*.txt')):
        for ln in open(f):
            ln=ln.strip()
            if not ln or ln.startswith('#'): continue
            p=[x.strip() for x in ln.split('|')]
            assert len(p)==7,(f,ln[:60],len(p))
            cid,pl,sg,dom,grp,core,rare=p
            cats[cid]=dict(id=cid,pl=pl,sg=sg,dom=dom,grp=grp,core=[x.strip() for x in core.split(',') if x.strip()],rare=[x.strip() for x in rare.split(',') if x.strip()])
    return cats
if __name__=='__main__':
    c=load(); n=sum(len(x['core'])+len(x['rare']) for x in c.values())
    print(len(c),'categories',n,'items')
    seen=collections.defaultdict(list)
    for x in c.values():
        for i in x['core']+x['rare']: seen[i.lower()].append(x['id'])
    for k,v in seen.items():
        if len(v)>1: print('DUP',k,v)
    for x in c.values():
        if len(x['core'])+len(x['rare'])<5: print('SMALL',x['id'])
