import json
ROOT="/home/claude/game-night"
cur=json.load(open(ROOT+"/src/content/sports.json"))
new=sorted(json.load(open("new_sports.json")),key=lambda x:-x["sl"])
n=len(new); cut=[round(n*.375),round(n*.525),round(n*.625)]  # 37.5% L1, 15% L2, 10% L3, 37.5% L4
def era(y):
    p=y+27
    return "90s" if p<2000 else "00s" if p<2010 else "10s" if p<2020 else "now"
for i,x in enumerate(new):
    lv=1 if i<cut[0] else 2 if i<cut[1] else 3 if i<cut[2] else 4
    y=int(x["dob"]) if x["dob"].isdigit() else 1985
    eras=sorted({era(y-3),era(y),era(y+3)})
    cur.append(dict(id=x["id"],name=x["name"],level=lv,w=x["w"],h=x["h"],g="f" if x["sex"]=="Q6581072" else "m",sports=x["sports"],leagues=x["leagues"],eras=eras,src=x["src"]))
json.dump(cur,open(ROOT+"/src/content/sports.json","w"),ensure_ascii=False,indent=0)
import collections
print(len(cur),collections.Counter(a["level"] for a in cur),collections.Counter(s for a in cur for s in a["sports"]))
