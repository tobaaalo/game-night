import { useState } from "react";
import { WhoGotIt } from "../components/ui";
import { useApp } from "../lib/app";
import type { ClueItem } from "../content";
import { Finish } from "./frame";

/** Three Clues, one word. Guess on the first clue for 3 points, the second for 2, the third for 1. */
export function ClueRun({ items, onAgain }: { items: ClueItem[]; onAgain: () => void }) {
  const { award } = useApp();
  const [i, setI] = useState(0);
  const [shown, setShown] = useState(1);
  const [end, setEnd] = useState<"got" | "none" | null>(null);
  const it = items[i];
  if (!it) return <Finish onAgain={onAgain} />;
  const worth = 4 - shown;
  const next = (ids: string[]) => {
    ids.forEach((id) => award(id, worth));
    setI((x) => x + 1);
    setShown(1);
    setEnd(null);
  };
  return (
    <div className="qcard stack" key={i}>
      <div className="qmeta">
        <p className="prog">
          {i + 1} / {items.length}
        </p>
        <p className="prog">
          {end === "none" ? "0 pts" : `${worth} ${worth === 1 ? "pt" : "pts"}`}
        </p>
      </div>
      <h2 className="qprompt">Who or what am I?</h2>
      <div className="clues stack">
        {[it[3], it[4], it[5]].slice(0, shown).map((c, k) => (
          <p key={k} className={k === shown - 1 && !end ? "clue new" : "clue"}>
            <b>Clue {k + 1}</b> {c}
          </p>
        ))}
      </div>
      {!end && (
        <div className="actions center">
          <button className="btn" onClick={() => setEnd("got")}>
            Someone guessed it
          </button>
          {shown < 3 ? (
            <button className="btn ghost" onClick={() => setShown(shown + 1)}>
              No guess yet: next clue
            </button>
          ) : (
            <button className="btn ghost" onClick={() => setEnd("none")}>
              Nobody got it
            </button>
          )}
        </div>
      )}
      {end && <p className="h2 center-text">{it[2]}</p>}
      {end === "got" && <WhoGotIt label="Who got it?" points={worth} onDone={next} />}
      {end === "none" && (
        <div className="actions center">
          <button className="btn" onClick={() => next([])} autoFocus>
            Next one
          </button>
        </div>
      )}
    </div>
  );
}
