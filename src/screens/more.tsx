import { useState } from "react";
import { Choice, Icon } from "../components/ui";
import { useApp } from "../lib/app";
import {
  CUSTOM_TYPES,
  loadCustom,
  parseLines,
  saveCustom,
  validate,
  type CustomGame,
  type CustomType,
} from "../lib/custom";
import { FACES, PAIRS } from "../content";
import { remove } from "../lib/store";

export function Make() {
  const { go, toast } = useApp();
  const [list, setList] = useState<CustomGame[]>(loadCustom);
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [type, setType] = useState<CustomType>("quiz");
  const [lines, setLines] = useState("");
  const [err, setErr] = useState("");
  const persist = (l: CustomGame[]) => {
    setList(l);
    saveCustom(l);
  };
  const reset = () => {
    setEditing(null);
    setName("");
    setLines("");
    setErr("");
  };
  const submit = () => {
    if (!name.trim()) {
      setErr("name:Give your game a name first.");
      return document.getElementById("mk-name")?.focus();
    }
    const problem = validate(type, parseLines(lines));
    if (problem) {
      setErr("lines:" + problem);
      return document.getElementById("mk-lines")?.focus();
    }
    const g: CustomGame = {
      id: editing ?? Math.random().toString(36).slice(2, 8),
      name: name.trim(),
      type,
      lines,
      updated: Date.now(),
    };
    persist(editing ? list.map((x) => (x.id === editing ? g : x)) : [g, ...list]);
    toast(`Saved "${g.name}". It's in your library under Your own games.`);
    reset();
  };
  const del = (g: CustomGame) => {
    const snapshot = list;
    persist(list.filter((x) => x.id !== g.id));
    toast(`Deleted "${g.name}".`, () => persist(snapshot));
  };
  const t = CUSTOM_TYPES[type];
  const count = parseLines(lines).length;
  return (
    <div className="screen">
      <div className="stagger">
        <button className="link" onClick={() => go("/games")}>
          ← Back to games
        </button>
        <h1 className="h1" tabIndex={-1}>
          {editing ? "Edit your game" : "Make your own game"}
        </h1>
        <p className="lede">
          Type your own questions and the app turns them into a game. It stays on this phone and works offline.
        </p>
      </div>
      <form
        className="panel stack"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="field">
          <label htmlFor="mk-name">Game name</label>
          <input
            id="mk-name"
            className="input"
            aria-invalid={err.startsWith("name:")}
            aria-describedby={err.startsWith("name:") ? "mk-name-err" : undefined}
            value={name}
            maxLength={40}
            onChange={(e) => (setName(e.target.value), setErr(""))}
            placeholder="e.g. Our Wedding Quiz"
          />
          {err.startsWith("name:") && (
            <p className="error-text" id="mk-name-err" role="alert">
              {err.slice(5)}
            </p>
          )}
        </div>
        <Choice<CustomType>
          legend="Kind of game"
          options={(Object.keys(CUSTOM_TYPES) as CustomType[]).map((k) => ({ value: k, label: CUSTOM_TYPES[k].label }))}
          value={type}
          onChange={(v) => (setType(v as CustomType), setErr(""))}
        />
        <div className="field">
          <label htmlFor="mk-lines">Your lines</label>
          <p className="hint" id="mk-help">
            {t.help}
          </p>
          <textarea
            id="mk-lines"
            className="input mono"
            aria-describedby={err.startsWith("lines:") ? "mk-help mk-lines-err" : "mk-help"}
            aria-invalid={err.startsWith("lines:")}
            value={lines}
            onChange={(e) => (setLines(e.target.value), setErr(""))}
            placeholder={t.example}
          />
          <div className="actions" style={{ justifyContent: "space-between" }}>
            <span className="hint">
              {count} {count === 1 ? "line" : "lines"}
            </span>
            <button type="button" className="link" onClick={() => setLines(t.example)}>
              Fill with an example
            </button>
          </div>
        </div>
        {err.startsWith("lines:") && (
          <p className="error-text" id="mk-lines-err" role="alert">
            {err.slice(6)}
          </p>
        )}
        <div className="actions">
          <button className="btn" type="submit">
            {editing ? "Save changes" : "Save game"}
          </button>
          {editing && (
            <button type="button" className="btn ghost" onClick={reset}>
              Cancel
            </button>
          )}
        </div>
      </form>
      <section aria-labelledby="mine">
        <h2 className="h3" id="mine" style={{ marginBottom: 12 }}>
          Your games
        </h2>
        {list.length === 0 ? (
          <div className="empty-card">
            <p className="h3">Nothing here yet</p>
            <p className="muted">Your first game takes about a minute. Try a quiz about the two of you.</p>
          </div>
        ) : (
          <ul className="my-games">
            {list.map((g) => (
              <li key={g.id} className="mine-row">
                <span>
                  <b>{g.name}</b>
                  <span className="muted small">
                    {" "}
                    · {CUSTOM_TYPES[g.type].label} · {parseLines(g.lines).length} lines
                  </span>
                </span>
                <span className="actions">
                  <button className="btn small" onClick={() => go(`/play/custom-${g.id}`)}>
                    Play
                  </button>
                  <button
                    className="btn ghost small"
                    onClick={() => {
                      setEditing(g.id);
                      setName(g.name);
                      setType(g.type);
                      setLines(g.lines);
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                  >
                    Edit
                  </button>
                  <button className="icon-btn" onClick={() => del(g)} aria-label={`Delete ${g.name}`}>
                    <Icon.trash />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export function Settings() {
  const { go, resetScores, online } = useApp();
  const [save, setSave] = useState<{ done: number; total: number; state: "idle" | "busy" | "done" | "error" }>({
    done: 0,
    total: 0,
    state: "idle",
  });
  const saveAll = async () => {
    const urls = [
      ...FACES.map((f) => `/faces/${f.id}.jpg`),
      ...PAIRS.flatMap((p) => [`/realai/${p.id}-real.jpg`, `/realai/${p.id}-ai.jpg`]),
    ];
    setSave({ done: 0, total: urls.length, state: "busy" });
    let done = 0;
    let failed = 0;
    const queue = [...urls];
    const worker = async () => {
      while (queue.length) {
        const u = queue.shift()!;
        try {
          const r = await fetch(u);
          if (!r.ok) failed++;
        } catch {
          failed++;
        }
        done++;
        if (done % 10 === 0 || done === urls.length) setSave({ done, total: urls.length, state: "busy" });
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    setSave({ done, total: urls.length, state: failed ? "error" : "done" });
  };
  const pct = save.total ? Math.round((save.done / save.total) * 100) : 0;
  return (
    <div className="screen">
      <div className="stagger">
        <button className="link" onClick={() => go("/games")}>
          ← Back to games
        </button>
        <h1 className="h1" tabIndex={-1}>
          Settings
        </h1>
      </div>
      <section className="panel stack" aria-labelledby="off">
        <h2 className="h3" id="off">
          Play offline
        </h2>
        <p className="muted">
          Everything except the photos is already saved on this device. Save the photos too (about 26 MB) so Famous
          Faces and Real or AI work with no signal.
        </p>
        {save.state === "busy" && (
          <div
            className="progress"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Saving photos"
          >
            <span style={{ width: `${pct}%` }} />
          </div>
        )}
        <p aria-live="polite" className="small">
          {save.state === "busy" && `Saving… ${save.done} of ${save.total}`}
          {save.state === "done" && "All photos saved. You can play anywhere now."}
          {save.state === "error" &&
            "Some photos didn't save. Check your connection and tap Save again; it picks up where it left off."}
        </p>
        <div>
          <button className="btn" onClick={saveAll} disabled={!online || save.state === "busy"}>
            {save.state === "done" ? "Saved ✓" : "Save photos for offline"}
          </button>
          {!online && <p className="hint">You&rsquo;re offline right now. Connect to save the photos.</p>}
        </div>
      </section>
      <section className="panel stack" aria-labelledby="sc">
        <h2 className="h3" id="sc">
          Scores &amp; players
        </h2>
        <div className="actions">
          <button className="btn quiet" onClick={resetScores}>
            Reset scores
          </button>
          <button className="btn quiet" onClick={() => go("/names")}>
            Edit players
          </button>
          <button className="btn quiet" onClick={() => go("/who")}>
            Switch couples / friends
          </button>
        </div>
      </section>
      <section className="panel stack" aria-labelledby="fresh">
        <h2 className="h3" id="fresh">
          Fresh decks
        </h2>
        <p className="muted">
          Cards never repeat within five draws and the app remembers where you were. Start every pile from scratch here.
        </p>
        <div>
          <ShuffleAll />
        </div>
      </section>
      <p className="hint tiny">
        <button className="link" onClick={() => go("/credits")}>
          Photo credits
        </button>
      </p>
    </div>
  );
}

function ShuffleAll() {
  const { toast } = useApp();
  return (
    <button
      className="btn quiet"
      onClick={() => {
        try {
          Object.keys(localStorage)
            .filter((k) => k.startsWith("gn.deck."))
            .forEach(remove);
        } catch {
          /* ignore */
        }
        toast("All decks reshuffled.");
      }}
    >
      Reshuffle every deck
    </button>
  );
}

export function Credits() {
  const { go } = useApp();
  const [q, setQ] = useState("");
  const commons = (f: string) => `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(f.replace(/ /g, "_"))}`;
  const faces = FACES.filter((f) => f.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="screen">
      <div className="stagger">
        <button className="link" onClick={() => go("/settings")}>
          ← Back to settings
        </button>
        <h1 className="h1" tabIndex={-1}>
          Photo credits
        </h1>
        <p className="lede">
          Photos of people and the real photos in Real or AI come from Wikimedia Commons. Each link shows the
          photographer and licence. AI pictures were made with Figma AI and Gamma.
        </p>
      </div>
      <div className="field">
        <label htmlFor="cq">Find a name</label>
        <input
          id="cq"
          className="input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="e.g. Burna Boy"
        />
      </div>
      <h2 className="h3">Real or AI?</h2>
      <ul className="credits">
        {PAIRS.map((p) => (
          <li key={p.id}>
            {p.name}: real photo{" "}
            <a href={commons(p.src)} target="_blank" rel="noopener noreferrer">
              {p.src}
            </a>
            ; AI copy by {p.aiTool}
          </li>
        ))}
      </ul>
      <h2 className="h3">Famous Faces ({faces.length})</h2>
      <ul className="credits">
        {faces.map((f) => (
          <li key={f.id}>
            {f.name}:{" "}
            <a href={commons(f.src)} target="_blank" rel="noopener noreferrer">
              {f.src}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
