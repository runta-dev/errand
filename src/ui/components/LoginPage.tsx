import { ArrowRight, LoaderCircle, Settings } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import errandIcon from "../../assets/errand-icon.svg";

export function LoginPage({ status, error, allowConnectionSettings, onSignIn, onSettings }: { status: "idle" | "pending"; error?: string; allowConnectionSettings: boolean; onSignIn(): void; onSettings(): void }) {
  const [debugUnlocked, setDebugUnlocked] = useState(false); const controlPresses = useRef(0); const lastControlPress = useRef(0);
  useEffect(() => {
    const unlock = (event: KeyboardEvent) => {
      if (!allowConnectionSettings || event.key !== "Control") { controlPresses.current = 0; return; }
      const now = Date.now(); controlPresses.current = now - lastControlPress.current > 2000 ? 1 : controlPresses.current + 1; lastControlPress.current = now;
      if (controlPresses.current >= 5) setDebugUnlocked(true);
    };
    window.addEventListener("keydown", unlock); return () => window.removeEventListener("keydown", unlock);
  }, [allowConnectionSettings]);
  return <main className="login-page">
    <section className="login-panel" aria-labelledby="login-title">
      <div className="login-brand"><img src={errandIcon} alt="" /><h1 id="login-title">Errand</h1></div>
      <p>Your cloud agents, ready to take on real work.</p>
      <button className="login-primary" disabled={status === "pending"} onClick={onSignIn}>
        {status === "pending" ? <><LoaderCircle className="spin" size={18} /> Waiting for authorization…</> : <>Sign in <ArrowRight size={18} /></>}
      </button>
      {error && <div className="login-error" role="alert">{error}</div>}
      {allowConnectionSettings && debugUnlocked && <button className="login-settings" onClick={onSettings}><Settings size={15} /> Connection settings</button>}
    </section>
  </main>;
}
