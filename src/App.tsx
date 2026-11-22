import { useState } from "react";
import { Icon, Sheet, Toasts } from "./components/ui";
import { useApp } from "./lib/app";
import { Library, PlayRoute } from "./screens/library";
import { Credits, Keepsakes, Make, Settings } from "./screens/more";
import { GameImport, Review } from "./screens/share";
import { RoomHost, RoomJoin } from "./screens/room";
import { Names, Welcome, Who } from "./screens/start";

function Header() {
  const { go, group, players, path } = useApp();
  const [menu, setMenu] = useState(false);
  const minimal = path === "/" || path === "/welcome";
  const nav = (to: string) => {
    setMenu(false);
    go(to);
  };
  return (
    <header className="topbar">
      <div className="wrap">
        <button className="brand" onClick={() => go(group ? "/games" : "/")} aria-label="Game Night, home">
          Game Night
        </button>
        <span className="spacer" />
        {!minimal && group && (
          <button
            className="who-pill"
            onClick={() => go("/names")}
            aria-label={`${players.length} players. Change who's playing`}
          >
            <Icon.people />
            <span>
              {players.some((p) => p.bot)
                ? "vs Computer"
                : `${players.length} · ${group === "couple" ? "Couple" : "Friends"}`}
            </span>
          </button>
        )}
        <button className="icon-btn" onClick={() => setMenu(true)} aria-label="Menu" aria-haspopup="dialog">
          <Icon.menu />
        </button>
      </div>
      {menu && (
        <Sheet title="Menu" onClose={() => setMenu(false)}>
          <ul className="menu-list">
            <li>
              <button onClick={() => nav("/games")}>Games</button>
            </li>
            <li>
              <button onClick={() => nav("/who")}>Change who&rsquo;s playing</button>
            </li>
            <li>
              <button onClick={() => nav("/make")}>Make your own game</button>
            </li>
            <li>
              <button onClick={() => nav("/join")}>Join a friend&rsquo;s room</button>
            </li>
            <li>
              <button onClick={() => nav("/keepsakes")}>Keepsakes</button>
            </li>
            <li>
              <button onClick={() => nav("/settings")}>Settings &amp; offline</button>
            </li>
          </ul>
        </Sheet>
      )}
    </header>
  );
}

function Route() {
  const { path, onboarded, group } = useApp();
  const parts = path.split("/").filter(Boolean);
  switch (parts[0]) {
    case undefined:
      return onboarded && group ? <Library /> : onboarded ? <Who /> : <Welcome />;
    case "welcome":
      return <Welcome />;
    case "who":
      return <Who />;
    case "names":
      return <Names />;
    case "games":
      return <Library />;
    case "play":
      return <PlayRoute key={parts[1]} id={parts[1] ?? ""} />;
    case "make":
      return <Make />;
    case "settings":
      return <Settings />;
    case "credits":
      return <Credits />;
    case "keepsakes":
      return <Keepsakes />;
    case "g":
      return <GameImport key={parts[1]} id={parts[1] ?? ""} />;
    case "review":
      return <Review />;
    case "room":
      return <RoomHost />;
    case "join":
      return <RoomJoin initial={parts[1]} />;
    default:
      return <NotFound />;
  }
}

function NotFound() {
  const { go } = useApp();
  return (
    <div className="screen empty">
      <p className="eyebrow">Off air</p>
      <h1 className="h1" tabIndex={-1}>
        This page isn&rsquo;t on tonight&rsquo;s programme
      </h1>
      <button className="btn" onClick={() => go("/")}>
        Go to the start
      </button>
    </div>
  );
}

export default function App() {
  const { online, path } = useApp();
  return (
    <div className="shell">
      <a className="skip" href="#main">
        Skip to content
      </a>
      <Header />
      <main id="main" className="wrap">
        {!online && !path.startsWith("/join") && (
          <p className="banner offline-banner" role="status">
            You&rsquo;re offline. Pass-the-phone games still work.
          </p>
        )}
        <Route />
      </main>
      <Toasts />
    </div>
  );
}
