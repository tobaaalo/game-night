import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import QRCode from "qrcode";
import { Flaps, Icon, PromptText } from "../components/ui";
import { useApp } from "../lib/app";
import { load, save } from "../lib/store";
import { SECTIONS, gamesFor, type GameDef, type Section } from "../games/registry";
import { Ticket } from "./library";
import { MediaView, useKeys } from "../games/frame";
import { Setup } from "../games/quiz";
import { TeamLadder } from "../games/team";
import { LiveGame } from "./live";
import { normaliseCode, type ClientMsg, type RoomState, type ServerMsg } from "../shared/protocol";

type Conn = "connecting" | "open" | "retrying" | "slow" | "closed";

type Fallback = { code: string; role: "host" | "player"; key?: string; pid?: () => string };

/**
 * Live connection to the room. It is built for patchy mobile data:
 * - it never gives up: it keeps retrying with a short back-off and rejoins the moment the phone wakes or comes online;
 * - it notices a "zombie" connection (still open but silent) and replaces it;
 * - if live connections keep failing, it falls back to plain requests every couple of seconds, and sends answers that way too.
 */
function useRoomSocket(
  url: string | null,
  onError: (m: string) => void,
  fb?: Fallback,
  onEvent?: (m: ServerMsg) => void,
) {
  const [state, setState] = useState<RoomState | null>(null);
  const [you, setYou] = useState<string>();
  const [conn, setConn] = useState<Conn>("connecting");
  const [skew, setSkew] = useState(0);
  const ws = useRef<WebSocket | null>(null);
  const tries = useRef(0);
  const errRef = useRef(onError);
  errRef.current = onError;
  const fbRef = useRef(fb);
  fbRef.current = fb;
  const evRef = useRef(onEvent);
  evRef.current = onEvent;
  const take = useCallback((m: { state: RoomState; you?: string }) => {
    setState(m.state);
    if (m.you) setYou(m.you);
    if (m.state.now) setSkew(m.state.now - Date.now());
  }, []);
  useEffect(() => {
    if (!url) return;
    let stop = false;
    let final = false;
    let ping: ReturnType<typeof setInterval> | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let poll: ReturnType<typeof setInterval> | undefined;
    let lastHeard = Date.now();
    const stopPoll = () => {
      clearInterval(poll);
      poll = undefined;
    };
    const startPoll = () => {
      const f = fbRef.current;
      if (poll || !f) return;
      const run = async () => {
        try {
          const q = new URLSearchParams({ role: f.role, pid: f.pid?.() ?? "" });
          const r = await fetch(`/api/rooms/${f.code}/poll?${q}`);
          const j = (await r.json()) as { state?: RoomState; you?: string; error?: string };
          if (r.ok && j.state) {
            take({ state: j.state, you: j.you });
            setConn((c) => (c === "open" ? c : "slow"));
          } else if (r.status === 404 && j.error) {
            final = true;
            stopPoll();
            setConn("closed");
            errRef.current(j.error);
          }
        } catch {
          /* still offline */
        }
      };
      void run();
      poll = setInterval(run, 2500);
    };
    const open = () => {
      if (stop || final) return;
      setConn(tries.current ? "retrying" : "connecting");
      let s: WebSocket;
      try {
        s = new WebSocket(url);
      } catch {
        return retry();
      }
      ws.current = s;
      s.onopen = () => {
        tries.current = 0;
        lastHeard = Date.now();
        stopPoll();
        setConn("open");
        clearInterval(ping);
        ping = setInterval(() => {
          if (s.readyState !== 1) return;
          if (Date.now() - lastHeard > 25000) return s.close(); // silent for too long: replace it
          s.send(JSON.stringify({ t: "ping" }));
        }, 8000);
      };
      s.onmessage = (e) => {
        lastHeard = Date.now();
        const m = JSON.parse(e.data as string) as ServerMsg;
        if (m.t === "state") take(m);
        else if (m.t === "error") errRef.current(m.message);
        else evRef.current?.(m);
      };
      s.onclose = (e) => {
        clearInterval(ping);
        if (stop || ws.current !== s) return;
        if (e.code === 4000) {
          final = true;
          stopPoll();
          setConn("closed");
          errRef.current("The host removed you from the room.");
          return;
        }
        if (e.code === 1000 && e.reason === "Room closed") {
          final = true;
          stopPoll();
          setConn("closed");
          errRef.current("This room has closed.");
          return;
        }
        retry();
      };
    };
    const retry = () => {
      tries.current++;
      setConn("retrying");
      if (tries.current >= 2) startPoll();
      clearTimeout(timer);
      timer = setTimeout(open, Math.min(5000, 400 * 2 ** Math.min(tries.current, 4)));
    };
    open();
    // A locked or sleeping phone drops its connection. Rejoin the moment it wakes, without waiting for the back-off.
    const wake = () => {
      if (stop || final || document.visibilityState === "hidden") return;
      if (ws.current && ws.current.readyState === 1 && Date.now() - lastHeard < 20000) return;
      clearTimeout(timer);
      tries.current = 0;
      try {
        ws.current?.close();
      } catch {
        /* ignore */
      }
      ws.current = null;
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
      stopPoll();
      ws.current?.close(1000, "leaving");
    };
  }, [url, take]);
  const send = useCallback(
    (m: ClientMsg) => {
      if (ws.current?.readyState === 1) return ws.current.send(JSON.stringify(m));
      const f = fbRef.current;
      if (!f) return;
      fetch(`/api/rooms/${f.code}/msg`, {
        method: "POST",
        body: JSON.stringify({ role: f.role, key: f.key, pid: f.pid?.(), msg: m }),
      })
        .then((r) => r.json())
        .then((j: { state?: RoomState; you?: string }) => j.state && take({ state: j.state, you: j.you }))
        .catch(() => undefined);
    },
    [take],
  );
  return { state, you, conn, send, skew };
}

const wsUrl = (code: string, q: Record<string, string>) =>
  `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/rooms/${code}/ws?${new URLSearchParams(q)}`;

/** Games the room can run. Two-player games drop out of the list once a third person joins. */
const ROOM_GAMES = (count: number) => gamesFor(null).filter((g) => g.room && (!g.maxPlayers || count <= g.maxPlayers));

function ConnBanner({ conn }: { conn: Conn }) {
  if (conn === "open") return null;
  return (
    <p className="banner" role="status">
      {conn === "connecting"
        ? "Connecting to the room…"
        : conn === "retrying"
          ? "Reconnecting… hang tight."
          : conn === "slow"
            ? "Weak signal. Still playing, just a little slower."
            : "Disconnected."}
    </p>
  );
}

function Countdown({ deadline, skew = 0 }: { deadline: number; skew?: number }) {
  const [now, setNow] = useState(Date.now() + skew);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() + skew), 250);
    return () => clearInterval(t);
  }, [skew]);
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
  const [room, setRoom] = useState<{ code: string; hostKey: string } | null>(() => {
    // A control link (?host=CODE.KEY) hands this device the host controls for that room.
    const h = new URLSearchParams(location.search).get("host");
    const m = h && /^([A-Z0-9]{4})\.([\w-]{8,})$/.exec(h);
    if (m) {
      const rm = { code: m[1], hostKey: m[2] };
      save("gn.hostroom", rm);
      history.replaceState(null, "", location.pathname);
      return rm;
    }
    return load("gn.hostroom", null);
  });
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
      onDemoted={(code) => (setRoom(null), go(`/join/${code}`))}
    />
  );
}

function HostLive({
  room,
  game,
  setGame,
  onClose,
  onDemoted,
}: {
  room: { code: string; hostKey: string };
  game: GameDef | null;
  setGame: (g: GameDef | null) => void;
  onClose: () => void;
  onDemoted: (code: string) => void;
}) {
  const { toast } = useApp();
  const [error, setError] = useState("");
  const url = useMemo(() => wsUrl(room.code, { role: "host", key: room.hostKey }), [room]);
  const { state, conn, send, skew } = useRoomSocket(
    url,
    setError,
    {
      code: room.code,
      role: "host",
      key: room.hostKey,
    },
    (m) => {
      if (m.t !== "demote") return;
      // Someone else is the host now. This device carries on as a player, in the same seat if it was already playing.
      save("gn.hostroom", null);
      save(`gn.hostplay.${m.code}`, null);
      save(`gn.pid.${m.code}`, m.pid);
      save("gn.joinname", m.name);
      save("gn.session", { code: m.code, name: m.name, at: Date.now() });
      toast("You passed on the host role. You're playing now.");
      onDemoted(m.code);
    },
  );
  const [qr, setQr] = useState("");
  const [ctlCopied, setCtlCopied] = useState(false);
  const { players: appPlayers } = useApp();
  // The host can play too: this same device joins the room as a player and flips between the two views.
  const playKey = `gn.hostplay.${room.code}`;
  const [play, setPlay] = useState<string | null>(() => load<string | null>(playKey, null));
  const [playName, setPlayName] = useState(() => load("gn.joinname", appPlayers[0]?.name ?? ""));
  const [asking, setAsking] = useState(false);
  const [showHand, setShowHand] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const joinUrl = `${location.origin}/join/${room.code}`;
  const selfPid = play ? load<string>(`gn.pid.${room.code}`, "") : "";
  const myName = play || playName.trim() || "Host";
  useEffect(() => {
    QRCode.toDataURL(joinUrl, { margin: 1, width: 360, color: { dark: "#1c0610", light: "#efe6d8" } }).then(setQr, () =>
      setQr(""),
    );
  }, [joinUrl]);

  // A third person joining takes a two-player game off the list, and off the screen if it was picked.
  const joined = state?.players.length ?? 0;
  useEffect(() => {
    if (game?.maxPlayers && joined > game.maxPlayers) setGame(null);
  }, [game, joined, setGame]);

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
  const needTwo = !!game?.maxPlayers && players.length !== game.maxPlayers;
  // When the host is one of the two players, the board is in their own panel below, so it isn't drawn twice.
  const hostInDuel = !!selfPid && !!state?.live?.match?.sides.includes(selfPid);
  const others = players.filter((p) => p.pid !== selfPid);
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
      {(state?.leaveReq ?? []).map((r) => (
        <div className="panel ask" role="alert" key={r.pid}>
          <p className="h3">{r.name} wants to leave</p>
          <div className="actions">
            <button className="btn small" onClick={() => send({ t: "leave-ok", pid: r.pid })}>
              Let them go
            </button>
            <button className="btn ghost small" onClick={() => send({ t: "leave-no", pid: r.pid })}>
              Ask them to stay
            </button>
          </div>
        </div>
      ))}
      {state?.offer && (
        <div className="panel ask" role="status">
          <p className="h3">
            {state.offer.leaving ? "Passing the host on to" : "Waiting for"} {state.offer.name}
            {state.offer.leaving ? "…" : " to accept…"}
          </p>
          <p className="muted small">
            If they say no or don&rsquo;t answer, {state.offer.leaving ? "the next person is asked." : "you stay host."}
          </p>
          <button className="btn ghost small" onClick={() => send({ t: "host-cancel" })}>
            Cancel
          </button>
        </div>
      )}
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

      <div className="panel host-play">
        <div className="switch-row">
          <span>
            <span className="h3">I&rsquo;ll play too</span>
            <span className="muted small">{play ? `Playing as ${play}` : "Answer on this device as well"}</span>
          </span>
          <button
            role="switch"
            aria-checked={!!play}
            aria-label="I'll play too"
            className={clsx("switch", play && "on")}
            disabled={!play && phase !== "lobby"}
            onClick={() => {
              if (play) {
                if (selfPid) send({ t: "kick", pid: selfPid });
                save(playKey, null);
                setPlay(null);
              } else setAsking((v) => !v);
            }}
          >
            <span />
          </button>
        </div>
        {!play && asking && phase === "lobby" && (
          <form
            className="row-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (!playName.trim()) return;
              save("gn.joinname", playName.trim());
              save(playKey, playName.trim());
              setPlay(playName.trim());
              setAsking(false);
            }}
          >
            <input
              className="input"
              aria-label="Your name"
              placeholder="Your name"
              value={playName}
              maxLength={20}
              onChange={(e) => setPlayName(e.target.value)}
            />
            <button className="btn" type="submit" disabled={!playName.trim()}>
              Join
            </button>
          </form>
        )}
      </div>
      {others.length > 0 && (
        <section className="stack">
          <button className="btn quiet block" aria-expanded={showHand} onClick={() => setShowHand((v) => !v)}>
            Make someone else host
          </button>
          {showHand && (
            <div className="panel stack host-tools">
              <p className="muted small">They get a request on their phone. When they say yes, they run the game.</p>
              <ul className="joined">
                {others.map((p) => (
                  <li key={p.pid} className={clsx(!p.connected && "away")}>
                    <span>{p.name}</span>
                    <button
                      className="btn quiet small"
                      disabled={!!state?.offer}
                      onClick={() => {
                        send({ t: "host-offer", pid: p.pid, self: selfPid || undefined, name: myName });
                        setShowHand(false);
                      }}
                    >
                      Make host
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
      <div>
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
                  <button
                    className="btn quiet small"
                    onClick={() => {
                      const link = `${location.origin}/room?host=${room.code}.${room.hostKey}`;
                      void navigator.clipboard?.writeText(link);
                      setCtlCopied(true);
                    }}
                  >
                    {ctlCopied ? "Control link copied" : "Control from a phone"}
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
                  Names appear here as people join. Want to play too? Join from your own phone with the same code. Want
                  the controls on a phone? Tap &ldquo;Control from a phone&rdquo; and send yourself the link.
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
              <RoomPicker game={game} setGame={setGame} count={players.length} />
            </section>
            {!game ? (
              <div className="dock">
                <button className="btn block" disabled>
                  Pick a game to start
                </button>
              </div>
            ) : (
              <section className="stack" aria-label={`${game.name} settings`}>
                <div className="panel howto">
                  <p className="h3">How to play {game.roomName ?? game.name}</p>
                  <p>{game.how}</p>
                </div>
                <Setup
                  id={`room-${game.id}`}
                  fields={game.roomFields ?? []}
                  players={players.length}
                  disabled={!players.length || needTwo}
                  startLabel={
                    needTwo
                      ? `${game.name} needs exactly 2 players (${players.length} here)`
                      : players.length
                        ? `Start with ${players.length} ${players.length === 1 ? "player" : "players"}`
                        : "Waiting for someone to join…"
                  }
                  onStart={async (v) => {
                    if (!players.length || needTwo) return;
                    if (game.teamBuild) {
                      const puzzles = game.teamBuild(v);
                      send({
                        t: "team-start",
                        vs: v.vs === "after" ? "after" : "race",
                        within: v.within === "turns" ? "turns" : "free",
                        teams: Number(v.teams) || 0,
                        puzzles,
                      });
                      return;
                    }
                    if (game.liveBuild) {
                      const cfg = await game.liveBuild(
                        v,
                        players.map((p) => p.name),
                      );
                      send({ t: "live-start", game: game.name, cfg });
                      return;
                    }
                    const list =
                      (await game.buildQuestions?.(
                        v,
                        players.map((p) => p.name),
                      )) ?? [];
                    // The server runs the whole game from here: timers, reveals and the next question.
                    send({ t: "setup", game: game.name, total: list.length, queue: list });
                  }}
                />
              </section>
            )}
          </div>
        )}

        {(phase === "question" || phase === "reveal") && state?.question && (
          <HostQuestionView
            state={state}
            skew={skew}
            onReveal={() => send({ t: "reveal" })}
            onNext={() => send({ t: "next" })}
          />
        )}

        {phase === "live" && state?.live && !hostInDuel && (
          <div className="stack">
            <LiveGame state={state} me="host" send={send} skew={skew} />
            <ul className="live-scores" aria-label="Scores">
              {[...players]
                .sort((a, b) => b.score - a.score)
                .map((p) => (
                  <li key={p.pid}>
                    <span>{p.name}</span>
                    <strong className="mono">{p.score}</strong>
                  </li>
                ))}
            </ul>
          </div>
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
        {others.length > 0 && (
          <div className="actions center">
            {!confirmLeave ? (
              <button className="link" onClick={() => setConfirmLeave(true)}>
                Leave room
              </button>
            ) : (
              <div className="panel ask stack">
                <p className="h3">Leave and pass the host on?</p>
                <div className="actions">
                  <button
                    className="btn small"
                    disabled={!!state?.offer}
                    onClick={() => {
                      send({ t: "host-leave", self: selfPid || undefined, name: myName });
                      setConfirmLeave(false);
                    }}
                  >
                    Leave and pass the host on
                  </button>
                  <button className="btn ghost small" onClick={() => setConfirmLeave(false)}>
                    Stay
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

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
      {play && (
        <div className="host-player" hidden={phase === "lobby" || phase === "ended"}>
          <h2 className="h3">{state?.live?.kind === "duel" ? "Your game" : "Your answers"}</h2>
          <PlayerLive
            code={room.code}
            name={play}
            direct={(pid) => pid && send({ t: "kick", pid })}
            onLeave={() => {
              save(playKey, null);
              setPlay(null);
            }}
          />
        </div>
      )}
    </div>
  );
}

function Clues({ q }: { q: NonNullable<RoomState["question"]> }) {
  if (!q.shown) return null;
  const worth = (q.clueCount ?? 3) - q.shown.length + 1;
  return (
    <div className="clues stack">
      {q.shown.map((c, i) => (
        <p key={i} className={clsx("clue", i === q.shown!.length - 1 && "new")}>
          <b>Clue {i + 1}</b> {c}
        </p>
      ))}
      <p className="hint">
        Right now a correct answer is worth {worth} {worth === 1 ? "point" : "points"}.
      </p>
    </div>
  );
}

/** "Next question in 3" with a button to skip the wait. */
function NextBar({ state, skew, onNext }: { state: RoomState; skew: number; onNext: () => void }) {
  const last = (state.question?.n ?? 0) >= (state.total ?? 0);
  return (
    <div className="actions center">
      {state.nextAt && !last && <Countdown deadline={state.nextAt} skew={skew} />}
      <button className="btn" onClick={onNext} autoFocus>
        {last ? "See final scores" : "Next question"}
      </button>
    </div>
  );
}

function HostQuestionView({
  state,
  skew,
  onReveal,
  onNext,
}: {
  state: RoomState;
  skew: number;
  onReveal: () => void;
  onNext: () => void;
}) {
  const pq = state.question!;
  const revealed = state.phase === "reveal";
  const answered = state.players.filter((p) => p.answered).length;
  const correct = state.reveal?.correct;
  const poll = (correct ?? 0) < 0;
  return (
    <div className={clsx("stage marquee", !revealed && "live")}>
      <div className="qcard">
        <div className="qmeta">
          <p className="prog">
            Question {pq.n} of {state.total} {pq.label ? `· ${pq.label}` : ""}
          </p>
          {!revealed ? <Countdown deadline={pq.deadline} skew={skew} /> : <span className="tag">Answer</span>}
        </div>
        <h2 className="qprompt">
          <PromptText text={pq.prompt} />
        </h2>
        <Clues q={pq} />
        <MediaView media={pq.media} revealed={revealed} captions={state.reveal?.captions} />
        <div className={clsx("options", pq.options.length === 2 && "two")}>
          {pq.options.map((o, i) => {
            const count = revealed ? Object.values(state.reveal?.picks ?? {}).filter((p) => p.idx === i).length : 0;
            return (
              <div
                key={i}
                className={clsx(
                  "option static",
                  revealed && !poll && i === correct && "right",
                  revealed && !poll && i !== correct && "dim",
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
            {state.reveal?.explain && <p className="verdict good">{state.reveal.explain}</p>}
            <Leaderboard state={state} compact />
            <NextBar state={state} skew={skew} onNext={onNext} />
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
  const topScore = ranked[0]?.score ?? 0;
  const leaders = ranked.filter((p) => p.score === topScore);
  const headline =
    topScore <= 0
      ? "Game over"
      : leaders.length > 1
        ? `It's a tie: ${leaders.map((p) => p.name).join(" and ")}`
        : `${leaders[0].name} wins!`;
  return (
    <div className="stack">
      {title && <h2 className="h1 center-text">{ranked[0] ? headline : title}</h2>}
      <ol className={clsx("podium", compact && "compact")}>
        {ranked.map((p, i) => {
          const g = state.reveal?.picks[p.pid]?.gained;
          return (
            <li
              key={p.pid}
              className={clsx(
                i === 0 && !compact && topScore > 0 && leaders.length === 1 && "first",
                p.pid === you && "you",
              )}
            >
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
  const [joined, setJoined] = useState<{ code: string; name: string } | null>(() => {
    // Came back after a refresh, a dropped connection or a locked phone: go straight back into the room.
    const ses = load<{ code: string; name: string; at: number } | null>("gn.session", null);
    const want = normaliseCode(initial ?? "");
    if (!ses || Date.now() - ses.at > 3 * 3600 * 1000) return null;
    return !want || want === ses.code ? { code: ses.code, name: ses.name } : null;
  });

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

  if (joined)
    return (
      <PlayerLive code={joined.code} name={joined.name} onLeave={() => (save("gn.session", null), setJoined(null))} />
    );
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

function PlayerLive({
  code,
  name,
  onLeave,
  direct,
}: {
  code: string;
  name: string;
  onLeave: () => void;
  /** The host's own device leaves without asking itself. */
  direct?: (pid: string) => void;
}) {
  const { go, toast } = useApp();
  const [asked, setAsked] = useState(0);
  const pidKey = `gn.pid.${code}`;
  const [error, setError] = useState("");
  const url = useMemo(() => wsUrl(code, { role: "player", name, pid: load(pidKey, "") }), [code, name, pidKey]);
  const { state, you, conn, send, skew } = useRoomSocket(
    url,
    setError,
    {
      code,
      role: "player",
      pid: () => load(pidKey, ""),
    },
    (m) => {
      if (m.t === "host") {
        // The host passed the room to this phone.
        save("gn.hostroom", { code, hostKey: m.key });
        save(`gn.hostplay.${code}`, name);
        save("gn.session", null);
        toast("You're the host now.");
        go("/room");
      } else if (m.t === "left") {
        save("gn.session", null);
        save(pidKey, null);
        toast("You left the room.");
        onLeave();
      } else if (m.t === "denied") {
        setAsked(0);
        toast("The host asked you to stay for now.");
      }
    },
  );
  useEffect(() => {
    if (!asked) return;
    const t = setTimeout(() => setAsked((a) => (a ? -1 : a)), 12000);
    return () => clearTimeout(t);
  }, [asked]);
  const leave = () => {
    if (direct) {
      direct(you ?? "");
      return onLeave();
    }
    setAsked(Date.now());
    send({ t: "leave" });
  };
  const leaveNow = () => {
    send({ t: "leave", force: true });
    save("gn.session", null);
    save(pidKey, null);
    onLeave();
  };
  // Remember who I am in this room, so a refresh or a dropped connection drops me straight back in.
  const [mine, setMine] = useState<{ n: number; idx: number; changed: boolean } | null>(null);
  useEffect(() => {
    if (you) save(pidKey, you);
  }, [you, pidKey]);
  useEffect(() => {
    save("gn.session", { code, name, at: Date.now() });
  }, [code, name]);
  const q = state?.question;
  const myPick = mine && q && mine.n === q.n ? mine.idx : null;
  const canChange = !!mine && !mine.changed;
  const answer = (idx: number) => {
    if (!q || state?.phase !== "question") return;
    if (myPick != null && (idx === myPick || mine?.changed)) return;
    setMine({ n: q.n, idx, changed: myPick != null });
    send({ t: "answer", idx });
    navigator.vibrate?.(30);
  };
  // If my answer was lost on a bad connection, send it again once I'm back.
  const mePlayer = state?.players.find((p) => p.pid === you);
  useEffect(() => {
    if (conn === "open" && state?.phase === "question" && q && mine && mine.n === q.n && mePlayer && !mePlayer.answered)
      send({ t: "answer", idx: mine.idx });
  }, [conn, mePlayer?.answered, q?.n, state?.phase]); // eslint-disable-line react-hooks/exhaustive-deps
  useKeys(
    (k) => {
      if (/^[1-9]$/.test(k) && q && +k <= q.options.length) answer(+k - 1);
    },
    [q, myPick, state?.phase, mine],
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
      {state.offer && state.offer.pid === you && (
        <div className="panel ask" role="alert">
          <p className="h3">
            {state.offer.leaving ? "The host is leaving. Take over as host?" : "The host wants you to be the host."}
          </p>
          <div className="actions">
            <button className="btn small" onClick={() => send({ t: "host-answer", accept: true })}>
              Yes, I&rsquo;ll host
            </button>
            <button className="btn ghost small" onClick={() => send({ t: "host-answer", accept: false })}>
              No thanks
            </button>
          </div>
        </div>
      )}
      {state.phase === "lobby" && (
        <div className="empty">
          <p className="eyebrow">You&rsquo;re in!</p>
          <h1 className="h1" tabIndex={-1}>
            Waiting for the host to start
          </h1>
          <p className="muted">
            {state.players.length} in the room: {state.players.map((p) => p.name).join(", ")}
          </p>
        </div>
      )}
      {(state.phase === "question" || state.phase === "reveal") && q && (
        <div className="qcard">
          <div className="qmeta">
            <p className="prog">
              {q.n} / {state.total}
            </p>
            {state.phase === "question" && <Countdown deadline={q.deadline} skew={skew} />}
          </div>
          <h2 className="qprompt">
            <PromptText text={q.prompt} />
          </h2>
          <Clues q={q} />
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
                  aria-disabled={(myPick != null && !canChange) || state.phase !== "question"}
                >
                  <kbd>{i + 1}</kbd>
                  <span>{o}</span>
                </button>
              );
            })}
          </div>
          <p className="verdict center-text" aria-live="polite">
            {state.phase === "question" &&
              (myPick != null
                ? canChange
                  ? "Locked in! Tapped the wrong one? You can change it once."
                  : "Locked in! Waiting for the others…"
                : "Tap your answer.")}
            {state.phase === "reveal" &&
              ((state.reveal?.correct ?? 0) < 0
                ? "Here is how everyone voted."
                : gained
                  ? `Nice! +${gained}`
                  : `${myPick == null ? "Too slow this time." : "Not this time."} It was ${q.options[state.reveal?.correct ?? 0]}.`)}
          </p>
          {state.phase === "reveal" && state.reveal?.explain && <p className="verdict good">{state.reveal.explain}</p>}
          {state.phase === "reveal" && <NextBar state={state} skew={skew} onNext={() => send({ t: "next" })} />}
        </div>
      )}
      {state.phase === "live" && state.live && you && <LiveGame state={state} me={you} send={send} skew={skew} />}
      {state.phase === "team" && state.team && you && <TeamLadder team={state.team} me={you} send={send} />}
      {state.phase === "ended" && <Leaderboard state={state} title="Final scores" you={you} />}
      {!direct && (
        <div className="actions center room-end">
          {asked === 0 && (
            <button className="link" onClick={leave}>
              Leave room
            </button>
          )}
          {asked > 0 && <p className="muted small">Asked the host to let you leave…</p>}
          {asked < 0 && (
            <>
              <p className="muted small">The host hasn&rsquo;t answered yet.</p>
              <button className="btn ghost small" onClick={leaveNow}>
                Leave anyway
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function RoomPicker({ game, setGame, count }: { game: GameDef | null; setGame: (g: GameDef) => void; count: number }) {
  const [view, setViewState] = useState<"list" | "grid">(() =>
    load<"list" | "grid">("gn.libview", matchMedia("(max-width: 600px)").matches ? "grid" : "list"),
  );
  const [shut, setShut] = useState<string[]>(() => load<string[]>("gn.libshut", []));
  const setView = (v: "list" | "grid") => {
    setViewState(v);
    save("gn.libview", v);
  };
  const toggle = (id: string) =>
    setShut((a) => {
      const n = a.includes(id) ? a.filter((x) => x !== id) : [...a, id];
      save("gn.libshut", n);
      return n;
    });
  const all = ROOM_GAMES(count);
  const hiddenN = gamesFor(null).filter((g) => g.room && g.maxPlayers && count > g.maxPlayers).length;
  const sections = (Object.keys(SECTIONS) as Section[])
    .map((s) => ({ s, list: all.filter((g) => g.section === s) }))
    .filter((x) => x.list.length);
  let n = 0;
  return (
    <div className="stack">
      <div className="view-toggle" role="group" aria-label="How to show games">
        <button aria-pressed={view === "grid"} onClick={() => setView("grid")}>
          Grid
        </button>
        <button aria-pressed={view === "list"} onClick={() => setView("list")}>
          List
        </button>
      </div>
      {hiddenN > 0 && (
        <p className="hint">
          {hiddenN} game{hiddenN === 1 ? " is" : "s are"} hidden because {hiddenN === 1 ? "it is" : "they are"} for 2
          players only.
        </p>
      )}
      {sections.map(({ s, list }) => (
        <section key={s} className="lib-section" aria-labelledby={`rsec-${s}`}>
          <h3 id={`rsec-${s}`} className="sec-sign h3">
            <button
              className="sec-toggle"
              aria-expanded={!shut.includes(s)}
              aria-controls={`rlist-${s}`}
              onClick={() => toggle(s)}
            >
              <span>{SECTIONS[s].title}</span>
              <span className="sec-count">{list.length}</span>
              <span className={clsx("sec-chev", shut.includes(s) && "shut")}>
                <Icon.chevron />
              </span>
            </button>
          </h3>
          <ul id={`rlist-${s}`} className={clsx("tickets", view)} hidden={shut.includes(s)}>
            {list.map((g) => {
              n += 1;
              return (
                <li key={g.id}>
                  <Ticket
                    g={g}
                    n={n}
                    view={view}
                    showRoom={false}
                    selected={game?.id === g.id}
                    title={g.roomName}
                    blurb={g.roomBlurb}
                    onOpen={() => setGame(g)}
                  />
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
