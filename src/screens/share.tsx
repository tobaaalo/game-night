import { useEffect, useState } from "react";
import { Icon } from "../components/ui";
import { useApp } from "../lib/app";
import { CUSTOM_TYPES, loadCustom, parseLines, saveCustom, type CustomGame } from "../lib/custom";
import { adminAct, adminList, getShared } from "../lib/shared";
import type { SharedGame } from "../shared/protocol";

const STATUS: Record<SharedGame["status"], string> = {
  link: "Private link",
  pending: "Waiting for approval",
  approved: "Approved",
  rejected: "Rejected",
};

/** Opened from a share link or code: preview a game, then add it to this phone. */
export function GameImport({ id }: { id: string }) {
  const { go, toast, online } = useApp();
  const [g, setG] = useState<SharedGame | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [msg, setMsg] = useState("");
  useEffect(() => {
    let live = true;
    setState("loading");
    getShared(id.toUpperCase())
      .then((x) => live && (setG(x), setState("ok")))
      .catch((e: Error) => live && (setMsg(e.message), setState("error")));
    return () => {
      live = false;
    };
  }, [id]);
  const add = (): string => {
    if (!g) return "";
    const list = loadCustom();
    const have = list.find((x) => x.shareId === g.id);
    if (have) return have.id;
    const copy: CustomGame = {
      id: Math.random().toString(36).slice(2, 8),
      name: g.name,
      type: g.type,
      lines: g.lines,
      updated: Date.now(),
    };
    saveCustom([{ ...copy, shareId: g.id, fromLink: true }, ...list]);
    return copy.id;
  };
  return (
    <div className="screen">
      <button className="link" onClick={() => go("/games")}>
        ← Back to games
      </button>
      {state === "loading" && <p className="lede">Looking for that game…</p>}
      {state === "error" && (
        <div className="empty-card">
          <h1 className="h2" tabIndex={-1}>
            We couldn&rsquo;t find that game
          </h1>
          <p className="muted">
            {online
              ? msg || "Check the code and try again. It may have been taken down."
              : "You're offline. Connect to the internet to open a shared game."}
          </p>
        </div>
      )}
      {state === "ok" && g && (
        <div className="stack">
          <div>
            <p className="eyebrow">Shared game</p>
            <h1 className="h1" tabIndex={-1}>
              {g.name}
            </h1>
            <p className="lede">
              {CUSTOM_TYPES[g.type].label} · {parseLines(g.lines).length} lines
              {g.author ? ` · by ${g.author}` : ""}
            </p>
          </div>
          <ul className="my-games">
            {parseLines(g.lines)
              .slice(0, 3)
              .map((l) => (
                <li key={l} className="mine-row">
                  <span>{l.split("|")[0]}</span>
                </li>
              ))}
          </ul>
          <div className="actions">
            <button
              className="btn"
              onClick={() => {
                const mine = add();
                go(`/play/custom-${mine}`);
              }}
            >
              Add and play
            </button>
            <button
              className="btn ghost"
              onClick={() => {
                add();
                toast(`Added "${g.name}" to your games.`);
                go("/games");
              }}
            >
              Add to my games
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Private page for the site owner: approve or reject games people share. Not linked from the menu. */
export function Review() {
  const { go, toast } = useApp();
  const [key, setKey] = useState(() => {
    try {
      return sessionStorage.getItem("gn.adminKey") ?? "";
    } catch {
      return "";
    }
  });
  const [typed, setTyped] = useState("");
  const [list, setList] = useState<SharedGame[] | null>(null);
  const [err, setErr] = useState("");
  const load = (k: string) =>
    adminList(k)
      .then((l) => {
        setList(l);
        setErr("");
        try {
          sessionStorage.setItem("gn.adminKey", k);
        } catch {
          /* ignore */
        }
      })
      .catch((e: Error) => {
        setList(null);
        setErr(e.message);
        setKey("");
      });
  useEffect(() => {
    if (key) void load(key);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const act = async (g: SharedGame, action: "approve" | "reject" | "delete") => {
    try {
      await adminAct(key, g.id, action);
      toast(action === "approve" ? `Approved "${g.name}".` : action === "reject" ? "Rejected." : "Deleted.");
      void load(key);
    } catch (e) {
      toast((e as Error).message);
    }
  };
  if (!key || !list)
    return (
      <div className="screen">
        <h1 className="h1" tabIndex={-1}>
          Review shared games
        </h1>
        <form
          className="panel stack"
          onSubmit={(e) => {
            e.preventDefault();
            setKey(typed);
            void load(typed);
          }}
        >
          <div className="field">
            <label htmlFor="adm">Your review key</label>
            <input
              id="adm"
              className="input"
              type="password"
              autoComplete="off"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
            />
            {err && (
              <p className="error-text" role="alert">
                {err}
              </p>
            )}
          </div>
          <button className="btn" type="submit" disabled={!typed}>
            Open
          </button>
        </form>
      </div>
    );
  const pending = list.filter((g) => g.status === "pending");
  const rest = list.filter((g) => g.status !== "pending");
  const Row = ({ g }: { g: SharedGame }) => (
    <li className="panel stack">
      <div>
        <b>{g.name}</b>
        <span className="muted small">
          {" "}
          · {CUSTOM_TYPES[g.type].label} · {parseLines(g.lines).length} lines
          {g.author ? ` · by ${g.author}` : ""} · {STATUS[g.status]}
        </span>
      </div>
      <ul className="review-lines">
        {parseLines(g.lines)
          .slice(0, 5)
          .map((l) => (
            <li key={l}>{l}</li>
          ))}
      </ul>
      <div className="actions">
        {g.status !== "approved" && g.scope === "public" && (
          <button className="btn small" onClick={() => act(g, "approve")}>
            Approve
          </button>
        )}
        {g.status === "pending" && (
          <button className="btn ghost small" onClick={() => act(g, "reject")}>
            Reject
          </button>
        )}
        <button className="icon-btn" onClick={() => act(g, "delete")} aria-label={`Delete ${g.name}`}>
          <Icon.trash />
        </button>
      </div>
    </li>
  );
  return (
    <div className="screen">
      <button className="link" onClick={() => go("/games")}>
        ← Back to games
      </button>
      <h1 className="h1" tabIndex={-1}>
        Review shared games
      </h1>
      <section aria-labelledby="pend" className="stack">
        <h2 className="h3" id="pend">
          Waiting for you ({pending.length})
        </h2>
        {pending.length === 0 && <p className="muted">Nothing waiting. New public games show up here.</p>}
        <ul className="stack">
          {pending.map((g) => (
            <Row key={g.id} g={g} />
          ))}
        </ul>
      </section>
      {rest.length > 0 && (
        <section aria-labelledby="done" className="stack">
          <h2 className="h3" id="done">
            Everything else
          </h2>
          <ul className="stack">
            {rest.map((g) => (
              <Row key={g.id} g={g} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
