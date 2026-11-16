import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import QRCode from "qrcode";
import { Flaps, Icon } from "../components/ui";
import { useApp } from "../lib/app";
import { load, save } from "../lib/store";
import { gamesFor, type GameDef } from "../games/registry";
import { MediaView, useKeys } from "../games/frame";
import { Setup } from "../games/quiz";
import { TeamLadder } from "../games/team";
import { normaliseCode, type ClientMsg, type HostQuestion, type RoomState, type ServerMsg } from "../shared/protocol";

type Conn = "connecting" | "open" | "retrying" | "closed";

/** WebSocket with automatic reconnect and keep-alive. */
function useRoomSocket(url: string | null, onError: (m: string) => void) {
  const [state, setState] = useState<RoomState | null>(null);
  const [you, setYou] = useState<string>();
  const [conn, setConn] = useState<Conn>("connecting");
  const ws = useRef<WebSocket | null>(null);
  const tries = useRef(0);
  const errRef = useRef(onError);
  errRef.current = onError;
  useEffect(() => {
    if (!url) return;
    let stop = false;
    let final = false;
    let ping: ReturnType<typeof setInterval>;
    let timer: ReturnType<typeof setTimeout>;
    const open = () => {
      setConn(tries.current ? "retrying" : "connecting");
      const s = new WebSocket(url);
      ws.current = s;
      s.onopen = () => {
        tries.current = 0;
        setConn("open");
        ping = setInterval(() => s.readyState === 1 && s.send(JSON.stringify({ t: "ping" })), 25000);
      };
      s.onmessage = (e) => {
        const m = JSON.parse(e.data as string) as ServerMsg;
        if (m.t === "state") {
          setState(m.state);
          if (m.you) setYou(m.you);
        } else if (m.t === "error") errRef.current(m.message);
      };
      s.onclose = (e) => {
        clearInterval(ping);
        if (stop) return;
        if (e.code === 4000) {
          final = true;
          setConn("closed");
          errRef.current("The host removed you from the room.");
          return;
        }
        if (e.code === 1000 && e.reason === "Room closed") {
          final = true;
          setConn("closed");
          errRef.current("This room has closed.");
          return;
        }
        tries.current++;
        if (tries.current > 8) {
          setConn("closed");
          errRef.current("Lost the connection to the room. Check you're online, then try joining again.");
          return;
        }
        setConn("retrying");
        timer = setTimeout(open, Math.min(8000, 500 * 2 ** tries.current));
      };
    };
    open();
    // A locked or sleeping phone drops its connection. Rejoin the moment it wakes, without waiting for the back-off.
    const wake = () => {
      if (stop || final || document.visibilityState === "hidden") return;
      if (ws.current && ws.current.readyState <= 1) return;
      clearTimeout(timer);
      tries.current = 0;
      open();
    };
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("online", wake);
    return () => {
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("online", wake);
      stop = true;
      clearTimeout(timer);
      clearInterval(ping);
      ws.current?.close(1000, "leaving");
    };
  }, [url]);
  const send = useCallback((m: ClientMsg) => {
    if (ws.current?.readyState === 1) ws.current.send(JSON.stringify(m));
  }, []);
  return { state, you, conn, send };
}

const wsUrl = (code: string, q: Record<string, string>) =>
  `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/rooms/${code}/ws?${new URLSearchParams(q)}`;

const ROOM_GAMES = () => gamesFor(null).filter((g) => g.room);

function ConnBanner({ conn }: { conn: Conn }) {
  if (conn === "open") return null;
  return (
    <p className="banner" role="status">
      {conn === "connecting"
        ? "Connecting to the room…"
        : conn === "retrying"
          ? "Reconnecting… hang tight."
          : "Disconnected."}
    </p>
  );
}

function Countdown({ deadline }: { deadline: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, Math.ceil((deadline - now) / 1000));
  return (
    <span className={clsx("room-clock", left <= 5 && "low")} role="timer" aria-label={`${left} seconds left`}>
      {left}
    </span>
  );
}

/* =================== HOST =================== */
export function RoomHost() {
  const { go, online } = useApp();
  const [game, setGame] = useState<GameDef | null>(null);
  const [room, setRoom] = useState<{ code: string; hostKey: string } | null>(() => load("gn.hostroom", null));
  const [err, setErr] = useState("");
  const [creating, setCreating] = useState(false);

  const create = async () => {
    setCreating(true);
    setErr("");
    try {
      const r = await fetch("/api/rooms", { method: "POST" });
      const j = (await r.json()) as { code?: string; hostKey?: string; error?: string };
      if (!r.ok || !j.code || !j.hostKey) throw new Error(j.error ?? "Couldn't open a room.");
      const rm = { code: j.code, hostKey: j.hostKey };
      save("gn.hostroom", rm);
      setRoom(rm);
    } catch (e) {
      setErr(
        e instanceof Error && e.message !== "Failed to fetch"
          ? e.message
          : "Couldn't reach the room server. Check you're online, then try again.",
      );
    } finally {
      setCreating(false);
    }
  };

  if (!room)
    return (
      <div className="screen">
        <div className="stagger">
          <button className="link" onClick={() => go("/games")}>
            ← Back to games
          </button>
          <p className="eyebrow">Room mode</p>
          <h1 className="h1" tabIndex={-1}>
            Play on everyone&rsquo;s phones
          </h1>
          <p className="lede">
            You get a 4-letter code. Friends open this site, type it in, and answer on their own phones. This screen
            shows the questions.
          </p>
        </div>
        <ol className="how-steps stagger">
          <li>
            <b>Open a room.</b> You&rsquo;ll get a code and a QR code.
          </li>
          <li>
            <b>Friends join.</b> Their names pop up here.
          </li>
          <li>
            <b>Pick a game and start.</b> Fastest right answers score most.
          </li>
        </ol>
        {err && (
          <p className="error-text" role="alert">
            {err}
          </p>
        )}
        <div className="dock">
          <button className="btn block" onClick={create} disabled={creating || !online}>
            {creating ? "Opening the room…" : "Open a room"}
          </button>
          {!online && <p className="hint center-text">Room mode needs internet. Connect and try again.</p>}
        </div>
      </div>
    );
  return (
    <HostLive
      room={room}
      game={game}
      setGame={setGame}
      onClose={() => (save("gn.hostroom", null), setRoom(null), go("/games"))}
    />
  );
}

function HostLive({
  room,
  game,
  setGame,
  onClose,
}: {
  room: { code: string; hostKey: string };
  game: GameDef | null;
  setGame: (g: GameDef | null) => void;
  onClose: () => void;
}) {
  const { toast } = useApp();
  const [error, setError] = useState("");
  const url = useMemo(() => wsUrl(room.code, { role: "host", key: room.hostKey }), [room]);
  const { state, conn, send } = useRoomSocket(url, setError);
  const [qs, setQs] = useState<HostQuestion[]>([]);
  const [qi, setQi] = useState(0);
  const [qr, setQr] = useState("");
  const joinUrl = `${location.origin}/join/${room.code}`;
  useEffect(() => {
    QRCode.toDataURL(joinUrl, { margin: 1, width: 360, color: { dark: "#1c0610", light: "#efe6d8" } }).then(setQr, () =>
      setQr(""),
    );
  }, [joinUrl]);

  // Auto-reveal when time runs out
  const deadline = state?.phase === "question" ? state.question?.deadline : undefined;
  useEffect(() => {
    if (!deadline) return;
    const t = setTimeout(() => send({ t: "reveal" }), Math.max(0, deadline - Date.now()) + 400);
    return () => clearTimeout(t);
  }, [deadline, send]);

  const ask = (i: number) => {
    const q = qs[i];
    if (!q) return send({ t: "end" });
    setQi(i);
    send({ t: "question", q });
  };
  useKeys(
    (k, e) => {
      if ((k === " " || k === "Enter") && state?.phase === "reveal") {
        e.preventDefault();
        ask(qi + 1);
      }
    },
    [state?.phase, qi, qs],
  );

  if (error && conn === "closed")
    return (
      <div className="screen empty">
        <h1 className="h2" tabIndex={-1}>
          Room closed
        </h1>
        <p className="lede">{error}</p>
        <button className="btn" onClick={onClose}>
          Back to games
        </button>
      </div>
    );
  const players = state?.players ?? [];
  const phase = state?.phase ?? "lobby";
  const endRoom = () => {
    let undone = false;
    toast("Ending the game for everyone…", () => (undone = true));
    setTimeout(() => {
      if (undone) return;
      send({ t: "end" });
      onClose();
    }, 6000);
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(joinUrl);
      toast("Link copied. Paste it in your group chat.");
    } catch {
      toast(`Share this link: ${joinUrl}`);
    }
  };

  return (
    <div className="screen room">
      <ConnBanner conn={conn} />
      <div className="room-head">
        <div>
          <p className="eyebrow">Room code</p>
          <p className="room-code" aria-label={`Room code ${room.code.split("").join(" ")}`}>
            {room.code.split("").map((c, i) => (
              <span key={i}>{c}</span>
            ))}
          </p>
        </div>
      </div>

      {phase === "lobby" && (
        <div className="room-lobby">
          <div className="panel join-panel">
            {qr ? (
              <img src={qr} alt={`QR code to join room ${room.code}`} width={180} height={180} className="qr" />
            ) : (
              <div className="qr skeleton" />
            )}
            <div className="stack">
              <p className="h3">Friends: open this site and tap &ldquo;Join a room&rdquo;, or scan.</p>
              <p className="mono small">{joinUrl.replace(/^https?:\/\//, "")}</p>
              <div className="actions">
                <button className="btn quiet small" onClick={copy}>
                  Copy invite link
                </button>
              </div>
            </div>
          </div>
          <section aria-labelledby="joined" className="stack">
            <h2 className="h3" id="joined">
              {players.length ? `${players.length} in the room` : "Waiting for players…"}
            </h2>
            {players.length === 0 ? (
              <p className="muted">
                Names appear here as people join. Want to play too? Join from your own phone with the same code.
              </p>
            ) : (
              <ul className="joined">
                {players.map((p) => (
                  <li key={p.pid} className={clsx(!p.connected && "away")}>
                    <span>{p.name}</span>
                    {!p.connected && <span className="small muted">reconnecting…</span>}
                    <button
                      className="icon-btn"
                      aria-label={`Remove ${p.name}`}
                      onClick={() => send({ t: "kick", pid: p.pid })}
                    >
                      <Icon.close />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section aria-labelledby="pickg" className="stack">
            <h2 className="h3" id="pickg">
              Pick a game
            </h2>
            <div className="room-games" role="radiogroup" aria-labelledby="pickg">
              {ROOM_GAMES().map((g, i) => (
                <button
                  key={g.id}
                  className={clsx("ticket", game?.id === g.id && "selected")}
                  role="radio"
                  aria-checked={game?.id === g.id}
                  onClick={() => setGame(g)}
                >
                  <span className="stub" aria-hidden="true">
                    <span className="stub-no">{String(i + 1).padStart(2, "0")}</span>
                  </span>
                  <span className="ticket-body">
                    <span className="ticket-title">{g.roomName ?? g.name}</span>
                    <span className="ticket-blurb">{g.roomBlurb ?? g.blurb}</span>
                  </span>
                </button>
              ))}
            </div>
          </section>
          {!game ? (
            <div className="dock">
              <button className="btn block" disabled>
                Pick a game to start
              </button>
            </div>
          ) : (
            <section className="stack" aria-label={`${game.name} settings`}>
              <Setup
                id={`room-${game.id}`}
                fields={game.roomFields ?? []}
                disabled={!players.length}
                startLabel={
                  players.length
                    ? `Start with ${players.length} ${players.length === 1 ? "player" : "players"}`
                    : "Waiting for someone to join…"
                }
                onStart={async (v) => {
                  if (!players.length) return;
                  if (game.teamBuild) {
                    const puzzles = game.teamBuild(v);
                    send({ t: "team-start", mode: v.mode === "free" ? "free" : "turns", puzzles });
                    return;
                  }
                  const list = (await game.buildQuestions?.(v)) ?? [];
                  setQs(list);
                  send({ t: "setup", game: game.name, total: list.length });
                  setQi(0);
                  setTimeout(() => list[0] && send({ t: "question", q: list[0] }), 50);
                }}
              />
            </section>
          )}
        </div>
      )}

      {(phase === "question" || phase === "reveal") && state?.question && (
        <HostQuestionView
          state={state}
          q={qs[qi]}
          onReveal={() => send({ t: "reveal" })}
          onNext={() => ask(qi + 1)}
          last={qi + 1 >= qs.length}
        />
      )}

      {phase === "team" && state?.team && (
        <TeamLadder
          team={state.team}
          me="host"
          send={send}
          onFinish={{
            label: "Play another game",
            run: () => {
              send({ t: "lobby" });
              setGame(null);
            },
          }}
        />
      )}

      <div className="actions center room-end">
        <button className="link" onClick={endRoom}>
          End the game for everyone
        </button>
      </div>

      {phase === "ended" && (
        <div className="stack">
          <Leaderboard state={state!} title="Final scores" />
          <div className="actions center">
            <button className="btn" onClick={() => (send({ t: "lobby" }), setGame(null))}>
              Play another game
            </button>
            <button className="btn ghost" onClick={endRoom}>
              Close the room
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function HostQuestionView({
  state,
  q,
  onReveal,
  onNext,
  last,
}: {
  state: RoomState;
  q?: HostQuestion;
  onReveal: () => void;
  onNext: () => void;
  last: boolean;
}) {
  const pq = state.question!;
  const revealed = state.phase === "reveal";
  const answered = state.players.filter((p) => p.answered).length;
  const correct = state.reveal?.correct;
  return (
    <div className={clsx("stage marquee", !revealed && "live")}>
      <div className="qcard">
        <div className="qmeta">
          <p className="prog">
            Question {pq.n} of {state.total} {pq.label ? `· ${pq.label}` : ""}
          </p>
          {!revealed ? <Countdown deadline={pq.deadline} /> : <span className="tag">Answer</span>}
        </div>
        <h2 className="qprompt">{pq.prompt}</h2>
        <MediaView media={pq.media} revealed={revealed} captions={state.reveal?.captions} />
        <div className={clsx("options", pq.options.length === 2 && "two")}>
          {pq.options.map((o, i) => {
            const count = revealed ? Object.values(state.reveal?.picks ?? {}).filter((p) => p.idx === i).length : 0;
            return (
              <div
                key={i}
                className={clsx(
                  "option static",
                  revealed && i === correct && "right",
                  revealed && i !== correct && "dim",
                )}
              >
                <kbd>{i + 1}</kbd>
                <span>{o}</span>
                {revealed && <span className="votes">{count}</span>}
              </div>
            );
          })}
        </div>
        {!revealed ? (
          <div className="actions center">
            <p className="muted" aria-live="polite">
              {answered} of {state.players.filter((p) => p.connected).length} locked in
            </p>
            <button className="btn ghost small" onClick={onReveal}>
              Reveal now
            </button>
          </div>
        ) : (
          <div className="stack">
            {q?.explain && <p className="verdict good">{q.explain}</p>}
            <Leaderboard state={state} compact />
            <div className="actions center">
              <button className="btn" onClick={onNext} autoFocus>
                {last ? "See final scores" : "Next question"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Leaderboard({
  state,
  title,
  compact,
  you,
}: {
  state: RoomState;
  title?: string;
  compact?: boolean;
  you?: string;
}) {
  const ranked = [...state.players].sort((a, b) => b.score - a.score);
  return (
    <div className="stack">
      {title && <h2 className="h1 center-text">{ranked[0] ? `${ranked[0].name} wins!` : title}</h2>}
      <ol className={clsx("podium", compact && "compact")}>
        {ranked.map((p, i) => {
          const g = state.reveal?.picks[p.pid]?.gained;
          return (
            <li key={p.pid} className={clsx(i === 0 && !compact && "first", p.pid === you && "you")}>
              <span className="place">{i + 1}</span>
              <span className="nm">
                {p.name}
                {p.pid === you && " (you)"}
              </span>
              {compact && g != null && (
                <span className={clsx("gain", g > 0 ? "good" : "bad")}>{g > 0 ? `+${g}` : "✗"}</span>
              )}
              <span className="pts">
                <Flaps value={p.score} min={1} />
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/* =================== PLAYER =================== */
export function RoomJoin({ initial }: { initial?: string }) {
  const { go, players } = useApp();
  const [code, setCode] = useState(normaliseCode(initial ?? ""));
  const [name, setName] = useState(() => load("gn.joinname", players[0]?.name ?? ""));
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [joined, setJoined] = useState<{ code: string; name: string } | null>(null);

  const submit = async () => {
    setErr("");
    if (code.length !== 4) return setErr("Room codes are 4 letters. Check the code on the host's screen.");
    if (!name.trim()) return setErr("Type your name so people know who's winning.");
    setBusy(true);
    try {
      const r = await fetch(`/api/rooms/${code}`);
      const j = (await r.json()) as { error?: string };
      if (!r.ok) throw new Error(j.error ?? "Couldn't find that room.");
      save("gn.joinname", name.trim());
      setJoined({ code, name: name.trim() });
    } catch (e) {
      setErr(
        e instanceof Error && e.message !== "Failed to fetch"
          ? e.message
          : "Couldn't reach the room. Check you're online, then try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  if (joined) return <PlayerLive code={joined.code} name={joined.name} onLeave={() => setJoined(null)} />;
  return (
    <form
      className="screen join"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="stagger">
        <button type="button" className="link" onClick={() => go("/")}>
          ← Home
        </button>
        <p className="eyebrow">Join a room</p>
        <h1 className="h1" tabIndex={-1}>
          Type the code on the host&rsquo;s screen
        </h1>
      </div>
      <div className="field">
        <label htmlFor="code">Room code</label>
        <input
          id="code"
          className="input code-input"
          value={code}
          onChange={(e) => (setCode(normaliseCode(e.target.value)), setErr(""))}
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          placeholder="ABCD"
          maxLength={4}
          autoFocus={!initial}
        />
      </div>
      <div className="field">
        <label htmlFor="jname">Your name</label>
        <input
          id="jname"
          className="input"
          value={name}
          maxLength={20}
          onChange={(e) => (setName(e.target.value), setErr(""))}
          autoComplete="given-name"
          autoFocus={!!initial}
        />
      </div>
      {err && (
        <p className="error-text" role="alert">
          {err}
        </p>
      )}
      <div className="dock">
        <button className="btn block" type="submit" disabled={busy}>
          {busy ? "Finding the room…" : "Join"}
        </button>
      </div>
    </form>
  );
}

function PlayerLive({ code, name, onLeave }: { code: string; name: string; onLeave: () => void }) {
  const pidKey = `gn.pid.${code}`;
  const [error, setError] = useState("");
  const url = useMemo(() => wsUrl(code, { role: "player", name, pid: load(pidKey, "") }), [code, name, pidKey]);
  const { state, you, conn, send } = useRoomSocket(url, setError);
  const [mine, setMine] = useState<{ n: number; idx: number } | null>(null);
  useEffect(() => {
    if (you) save(pidKey, you);
  }, [you, pidKey]);
  const q = state?.question;
  const myPick = mine && q && mine.n === q.n ? mine.idx : null;
  const answer = (idx: number) => {
    if (!q || myPick != null || state?.phase !== "question") return;
    setMine({ n: q.n, idx });
    send({ t: "answer", idx });
    navigator.vibrate?.(30);
  };
  useKeys(
    (k) => {
      if (/^[1-9]$/.test(k) && q && +k <= q.options.length) answer(+k - 1);
    },
    [q, myPick, state?.phase],
  );

  if (error && conn === "closed")
    return (
      <div className="screen empty">
        <h1 className="h2" tabIndex={-1}>
          You&rsquo;re out of the room
        </h1>
        <p className="lede">{error}</p>
        <button className="btn" onClick={onLeave}>
          Join another room
        </button>
      </div>
    );
  if (!state)
    return (
      <div className="screen">
        <ConnBanner conn={conn} />
        <div className="skeleton tall" />
        {error && <p className="error-text">{error}</p>}
      </div>
    );
  const me = state.players.find((p) => p.pid === you);
  const gained = you ? state.reveal?.picks[you]?.gained : undefined;
  return (
    <div className="screen room player">
      <ConnBanner conn={conn} />
      <div className="room-head">
        <div>
          <p className="eyebrow">Room {code}</p>
          <p className="h3">{name}</p>
        </div>
        <div className="me-score" aria-label={`Your score ${me?.score ?? 0}`}>
          <Flaps value={me?.score ?? 0} min={1} />
        </div>
      </div>
      {!state.hostConnected && <p className="banner">Waiting for the host to come back…</p>}
      {state.phase === "lobby" && (
        <div className="empty">
          <p className="eyebrow">You&rsquo;re in!</p>
          <h1 className="h1" tabIndex={-1}>
            Waiting for the host to start
          </h1>
          <p className="muted">
            {state.players.length} in the room: {state.players.map((p) => p.name).join(", ")}
          </p>
          <button className="link" onClick={onLeave}>
            Leave room
          </button>
        </div>
      )}
      {(state.phase === "question" || state.phase === "reveal") && q && (
        <div className="qcard">
          <div className="qmeta">
            <p className="prog">
              {q.n} / {state.total}
            </p>
            {state.phase === "question" && <Countdown deadline={q.deadline} />}
          </div>
          <h2 className="qprompt">{q.prompt}</h2>
          <MediaView
            media={q.media}
            revealed={state.phase === "reveal"}
            captions={state.reveal?.captions}
            onPick={q.media?.type === "pair" ? answer : undefined}
            states={q.options.map((_, i) =>
              state.phase === "reveal"
                ? i === state.reveal?.correct
                  ? "right"
                  : myPick === i
                    ? "wrong"
                    : undefined
                : myPick === i
                  ? "mine"
                  : undefined,
            )}
          />
          <div
            className={clsx("options", q.options.length === 2 && "two", "big-tap")}
            hidden={q.media?.type === "pair"}
          >
            {q.options.map((o, i) => {
              const corr = state.reveal?.correct;
              return (
                <button
                  key={i}
                  className={clsx(
                    "option",
                    myPick === i && "mine",
                    state.phase === "reveal" && i === corr && "right",
                    state.phase === "reveal" && myPick === i && i !== corr && "wrong",
                  )}
                  aria-pressed={myPick === i}
                  onClick={() => answer(i)}
                  aria-disabled={myPick != null || state.phase !== "question"}
                >
                  <kbd>{i + 1}</kbd>
                  <span>{o}</span>
                </button>
              );
            })}
          </div>
          <p className="verdict center-text" aria-live="polite">
            {state.phase === "question" && (myPick != null ? "Locked in! Waiting for the others…" : "Tap your answer.")}
            {state.phase === "reveal" &&
              (gained
                ? `Nice! +${gained}`
                : `${myPick == null ? "Too slow this time." : "Not this time."} It was ${q.options[state.reveal?.correct ?? 0]}.`)}
          </p>
        </div>
      )}
      {state.phase === "team" && state.team && you && <TeamLadder team={state.team} me={you} send={send} />}
      {state.phase === "ended" && <Leaderboard state={state} title="Final scores" you={you} />}
    </div>
  );
}
