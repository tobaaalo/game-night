import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/bungee/400.css";
import "@fontsource/bungee-shade/400.css";
import "@fontsource/chakra-petch/400.css";
import "@fontsource/chakra-petch/600.css";
import "@fontsource/chakra-petch/700.css";
import "./styles/app.css";
import "./styles/games.css";
import App from "./App";
import { AppProvider } from "./lib/app";
import { registerSW } from "virtual:pwa-register";

registerSW({ immediate: true });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </StrictMode>,
);
