import { ArrowRight, LoaderCircle, Settings } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import runtaIcon from "../../assets/runta-logo-icon.png";

export function LoginPage({ status, error, onSignIn, onSettings }: { status: "idle" | "pending"; error?: string; onSignIn(): void; onSettings(): void }) {
  const [debugUnlocked, setDebugUnlocked] = useState(false); const controlPresses = useRef(0); const lastControlPress = useRef(0);
  useEffect(() => {
    const unlock = (event: KeyboardEvent) => {
      if (event.key !== "Control") { controlPresses.current = 0; return; }
      const now = Date.now(); controlPresses.current = now - lastControlPress.current > 2000 ? 1 : controlPresses.current + 1; lastControlPress.current = now;
      if (controlPresses.current >= 5) setDebugUnlocked(true);
    };
    window.addEventListener("keydown", unlock); return () => window.removeEventListener("keydown", unlock);
  }, []);
  return <main className="login-page">
    <section className="login-panel" aria-labelledby="login-title">
      <div className="login-brand"><img src={runtaIcon} alt="" /><h1 id="login-title">Runta Crew</h1></div>
      <p>Your cloud agents, ready to take on real work.</p>
      <button className="login-primary" disabled={status === "pending"} onClick={onSignIn}>
        {status === "pending" ? <><LoaderCircle className="spin" size={18} /> Waiting for authorization…</> : <>Sign in <ArrowRight size={18} /></>}
      </button>
      {error && <div className="login-error" role="alert">{error}</div>}
      {debugUnlocked && <button className="login-settings" onClick={onSettings}><Settings size={15} /> Connection settings</button>}
    </section>
  </main>;
}
