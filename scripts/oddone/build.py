import random,json,sys,collections,itertools
from gen import load
random.seed(20261122)
C=load()
BAN={frozenset(p) for p in [
 ('keyinst','percinst'),('keyinst','stringinst'),('tools','garden'),('tools','utensils'),('scotcities','eucapitals'),
 ('popstars','hiphop'),('popstars','afrobeats'),('popstars','beatles'),('popstars','stones'),('popstars','queen'),('popstars','spice'),
 ('gems','nonmetals'),('nuts','trees'),('fruits','trees'),('hiphop','beatles'),('afrobeats','beatles'),
 ('mammals','dogbreeds'),('mammals','catbreeds'),('mammals','dinosaurs'),('reptiles','dinosaurs'),('birds','dinosaurs'),
 ('trackp','nigfoot'),('social','techco'),('videogames','pokemon'),('videogames','mario'),('heroes','greekgods'),('months','festivals'),('poets','britauth'),('poets','usauth'),('poets','rusauth'),('poets','afrauth'),('disney','pixar'),('units','weightunits'),('winter','teamball'),('mountains','volcanoes'),('sweets','desserts'),('swimp','nigfoot'),('hoopsp','nigfoot'),
]}
def ok_pair(a,b):
    if a['id']==b['id'] or frozenset((a['id'],b['id'])) in BAN: return False
    if a['grp']==b['grp']: return True            # siblings
    if a['dom']==b['dom']:
        pair={a['grp'],b['grp']}
        if a['dom']=='animal' and pair & {'breed','extinct'}: return False
        if a['dom']=='food' and 'cuisine' in pair: return False
    return True
def sibling(a,b): return a['grp']==b['grp']
cats=list(C.values())
usable_A=[c for c in cats if len(c['core'])+len(c['rare'])>=3]
use=collections.Counter(); oddcount=collections.Counter(); asets=set(); catuse=collections.Counter()
DIFF={'composers': 1, 'painters': 1, 'poets': 1, 'britauth': 1, 'usauth': 1, 'rusauth': 1, 'afrauth': 1, 'bible': 1, 'shakeplays': 1, 'austen': 1, 'bronte': 1, 'norsegods': 1, 'egyptgods': 1, 'hindugods': 1, 'orisha': 1, 'monsters': 1, 'heroes': 1, 'philosophers': 1, 'emperors': 1, 'pharaohs': 1, 'monarchs': 1, 'ussprez': 1, 'constellations': 1, 'stars': 1, 'moons': 1, 'galaxies': 1, 'dwarfplanets': 1, 'units': 1, 'igneous': 1, 'sedimentary': 1, 'metamorphic': 1, 'hormones': 1, 'viral': 1, 'bones': 1, 'muscles': 1, 'eyeparts': 1, 'earparts': 1, 'antibiotics': 1, 'painkillers': 1, 'vitamins': 1, 'artmoves': 1, 'afrobeats': 1, 'reggae': 1, 'hiphop': 1, 'tennisp': 1, 'f1': 1, 'trackp': 1, 'swimp': 1, 'hoopsp': 1, 'boxp': 1, 'golfp': 1, 'nigfoot': 1, 'ghafoot': 1, 'brafoot': 1, 'argfoot': 1, 'engfoot': 1, 'frafoot': 1, 'tempo': 1, 'dynamics': 1, 'keyinst': 1, 'genres': 1, 'dances': 1, 'imgfmt': 1, 'audfmt': 1, 'vidfmt': 1, 'proglangs': 1, 'opsys': 1, 'inputdev': 1, 'outputdev': 1, 'carparts': 1, 'bikeparts': 1, 'tube': 1, 'monopoly': 1, 'fabrics': 1, 'euro': 1, 'afrolang': 1, 'asialang': 1, 'sciences': 1, 'humanities': 1, 'startrek': 1, 'dc': 1, 'pixar': 1, 'detectives': 1, 'clouds': 1, 'currency': 1, 'ancientwonders': 1, 'nigcities': 1, 'scotcities': 1, 'eucapitals': 1, 'afcapitals': 1, 'ascapitals': 1, 'amcapitals': 1, 'lakes': 1, 'rivers': 1, 'mountains': 1, 'volcanoes': 1, 'islands': 1, 'primes': 1, 'squares': 1, 'sevens': 1, 'shapes3d': 1, 'spanish': 1, 'grapes': 1, 'teas': 1, 'catbreeds': 1, 'amphibians': 1, 'arachnids': 1, 'molluscs': 1, 'crustaceans': 1, 'dickens': 2, 'bacterial': 2, 'parasitic': 2, 'sculptors': 2, 'seabottom': 2}
def level_of(A,B,sib,r):
    d=max(DIFF.get(A['id'],0),DIFF.get(B['id'],0))
    if not sib: return 2 if (d>=1 or r>=2) else 1
    s=d+(0 if r==0 else 1 if r<=2 else 2)
    return 2 if s==0 else (3 if s<=2 else 4)
def make(target):
    for _ in range(4000):
        A=random.choice(usable_A)
        if catuse[A['id']]>=14: continue
        Bs=[b for b in cats if ok_pair(A,b) and (b['core'] or b['rare'])]
        sibs=[b for b in Bs if sibling(A,b)]; crs=[b for b in Bs if not sibling(A,b)]
        want_sib= random.random()<(0.15 if target==1 else 0.5 if target==2 else 0.8)
        pool= sibs if want_sib else crs
        if not pool: continue
        B=random.choice(pool)
        sib=sibling(A,B)
        # choose rare counts
        r=random.choice([0,0,1,2,3])
        # split r between A (0..4) and odd (0..1)
        rare_odd = 1 if (r>=1 and B['rare'] and random.random()<.5) else 0
        rare_A = r-rare_odd
        if rare_A>len(A['rare']) or rare_A>3: continue
        coreA=3-rare_A
        if coreA>len(A['core']): continue
        if rare_odd==0 and not B['core']: continue
        a_items=random.sample(A['rare'],rare_A)+random.sample(A['core'],coreA)
        odd=random.choice(B['rare'] if rare_odd else B['core'])
        items=a_items+[odd]
        if level_of(A,B,sib,sum(1 for i in items if i in A['rare'] or i in B['rare']))!=target: continue
        if any(use[i]>=4 for i in items) or oddcount[odd]>=2: continue
        key=frozenset(a_items)
        if key in asets: continue
        asets.add(key)
        for i in items: use[i]+=1
        oddcount[odd]+=1; catuse[A['id']]+=1
        return [target,a_items,odd,f"The others are {A['pl']}. It is {B['sg']}."] , A['id'],B['id']
    return None
out=[];meta=[]
per=int(sys.argv[1]) if len(sys.argv)>1 else 250
for lv in (1,2,3,4):
    n=0
    while n<per:
        r=make(lv)
        if not r: print('stuck at level',lv,n); break
        q,a,b=r
        # fix: include odd inside options list
        opts=q[1]+[q[2]]
        out.append([q[0],opts,q[2],q[3]]); meta.append((a,b)); n+=1
random.shuffle(out)
json.dump(out,open('oddone.out.json','w'),ensure_ascii=False,separators=(',',':'))
print(len(out),collections.Counter(q[0] for q in out))
