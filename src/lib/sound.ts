import { load, save } from "./store";

let ctx: AudioContext | null = null;
export const soundOn = () => load<boolean>("gn.sound", true);
export const setSoundOn = (v: boolean) => save("gn.sound", v);
export const speakAuto = () => load<boolean>("gn.speak", false);
export const setSpeakAuto = (v: boolean) => save("gn.speak", v);
export const largeText = () => load<boolean>("gn.large", false);
export const setLargeText = (v: boolean) => {
  save("gn.large", v);
  applyTextSize();
};
export const applyTextSize = () => {
  document.documentElement.dataset.text = largeText() ? "large" : "normal";
};

type Name = "right" | "wrong" | "streak" | "tick";
const NOTES: Record<Name, [number, number][]> = {
  right: [
    [660, 0.1],
    [880, 0.16],
  ],
  wrong: [
    [220, 0.18],
    [165, 0.22],
  ],
  streak: [
    [660, 0.08],
    [880, 0.08],
    [1320, 0.2],
  ],
  tick: [[900, 0.04]],
};

/** Short game-show blips. Quiet by default and silent when muted or unsupported. */
export function sfx(name: Name) {
  if (!soundOn()) return;
  try {
    const AC =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx ??= new AC();
    if (ctx.state === "suspended") void ctx.resume();
    let t = ctx.currentTime;
    for (const [freq, dur] of NOTES[name]) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = name === "wrong" ? "sawtooth" : "triangle";
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.07, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + dur + 0.02);
      t += dur * 0.9;
    }
  } catch {
    /* sound is a nicety, never an error */
  }
}

export const canSpeak = () => typeof window !== "undefined" && "speechSynthesis" in window;
export function speak(text: string) {
  if (!canSpeak()) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.95;
    window.speechSynthesis.speak(u);
  } catch {
    /* ignore */
  }
}
export const stopSpeaking = () => {
  try {
    window.speechSynthesis?.cancel();
  } catch {
    /* ignore */
  }
};
