import React, { useState, useRef, useCallback, useEffect } from "react";

type StepStatus = "idle" | "active" | "done";

interface Step {
  label: string;
  description: string;
  icon: string;
}

const STEPS: Step[] = [
  { label: "Send", description: "Your app sends a request to the NotifyHub API", icon: "1" },
  { label: "Validate", description: "API authenticates the token and validates the payload", icon: "2" },
  { label: "Enqueue", description: "The message is persisted and added to the job queue", icon: "3" },
  { label: "Process", description: "A worker picks up the job and resolves the template", icon: "4" },
  { label: "Deliver", description: "The channel adapter sends the notification (email, SMS)", icon: "5" },
  { label: "Done", description: "Delivery confirmed. Status updated to sent.", icon: "6" },
];

const STEP_DURATION_MS = 1200;

const C = {
  primary: "#2563eb",
  primaryLight: "#3b82f6",
  active: "#f59e0b",
  done: "#10b981",
  idle: "#6b7280",
  bg: "#1e1e2e",
  cardBg: "#2a2a3e",
  text: "#e2e8f0",
  textMuted: "#94a3b8",
  dot: "#475569",
  line: "#334155",
};

export default function MessageFlow(): React.JSX.Element {
  const [statuses, setStatuses] = useState<StepStatus[]>(() => STEPS.map(() => "idle"));
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(-1);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const step = useRef(0);

  const clear = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
  }, []);

  const reset = useCallback(() => {
    clear(); setPlaying(false); setCurrent(-1); step.current = 0;
    setStatuses(STEPS.map(() => "idle"));
  }, [clear]);

  const advance = useCallback(() => {
    const idx = step.current;
    if (idx >= STEPS.length) { setPlaying(false); return; }
    setStatuses(prev => {
      const next = [...prev];
      if (idx > 0) next[idx - 1] = "done";
      next[idx] = "active";
      return next;
    });
    setCurrent(idx);
    step.current = idx + 1;
    timer.current = setTimeout(() => {
      if (step.current >= STEPS.length) {
        setStatuses(prev => { const n = [...prev]; n[STEPS.length - 1] = "done"; return n; });
        setCurrent(STEPS.length - 1);
        setPlaying(false);
      } else { advance(); }
    }, STEP_DURATION_MS);
  }, []);

  const play = useCallback(() => {
    reset();
    timer.current = setTimeout(() => { setPlaying(true); advance(); }, 100);
  }, [reset, advance]);

  useEffect(() => () => clear(), [clear]);

  const activeIdx = statuses.findIndex(s => s === "active");
  const lastDone = statuses.lastIndexOf("done");
  const progressStep = activeIdx >= 0 ? activeIdx : lastDone >= 0 ? lastDone : -1;
  const progressPct = progressStep < 0 ? 0 : (progressStep / (STEPS.length - 1)) * 90;

  return (
    <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif', padding: '2rem', background: C.bg, borderRadius: 12, color: C.text, maxWidth: 720, margin: '2rem auto', userSelect: 'none' }}>
      <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
        <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 0.25rem' }}>Message Flow</h3>
        <p style={{ fontSize: '0.875rem', color: C.textMuted, margin: 0 }}>See how a notification travels through NotifyHub</p>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative', padding: '1.5rem 0' }}>
        <div style={{ position: 'absolute', top: '50%', left: '5%', right: '5%', height: 3, background: C.line, transform: 'translateY(-50%)', borderRadius: 2, zIndex: 0 }} />
        <div style={{ position: 'absolute', top: '50%', left: '5%', height: 3, width: `${progressPct}%`, background: `linear-gradient(90deg, ${C.primary}, ${C.done})`, transform: 'translateY(-50%)', borderRadius: 2, zIndex: 1, transition: 'width 0.4s ease' }} />
        {STEPS.map((s, i) => {
          const st = statuses[i];
          const isCur = i === current;
          const sz = isCur ? 44 : 36;
          let bg = C.dot, shadow = 'none', border = 'transparent';
          if (st === 'done') bg = C.done;
          else if (st === 'active') { bg = C.active; shadow = `0 0 16px 4px ${C.active}55`; border = C.active; }
          return (
            <div key={s.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 2, position: 'relative', flex: 1 }}>
              <div style={{ width: sz, height: sz, borderRadius: '50%', background: bg, border: `3px solid ${border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700, color: st === 'idle' ? C.textMuted : '#fff', boxShadow: shadow, transition: 'all 0.4s ease', transform: isCur && st === 'active' ? 'scale(1.1)' : 'scale(1)' }}>
                {st === 'done' ? '✓' : s.icon}
              </div>
              <span style={{ marginTop: '0.625rem', fontSize: '0.75rem', fontWeight: 600, color: st === 'idle' ? C.textMuted : C.text, textAlign: 'center', transition: 'color 0.3s' }}>{s.label}</span>
              <span style={{ display: 'inline-block', padding: '0.2rem 0.6rem', borderRadius: 9999, fontSize: '0.7rem', fontWeight: 600, background: `${st === 'active' ? C.active : st === 'done' ? C.done : C.dot}22`, color: st === 'active' ? C.active : st === 'done' ? C.done : C.dot, border: `1px solid ${st === 'active' ? C.active : st === 'done' ? C.done : C.dot}44`, marginTop: '0.375rem', transition: 'all 0.3s' }}>
                {st === 'idle' ? 'Waiting' : st === 'active' ? 'Running' : 'Done'}
              </span>
            </div>
          );
        })}
      </div>

      {current >= 0 && current < STEPS.length && (
        <div style={{ marginTop: '1.5rem', padding: '1rem 1.25rem', background: C.cardBg, borderRadius: 8, border: `1px solid ${C.line}`, display: 'flex', alignItems: 'center', gap: '0.75rem', transition: 'all 0.3s' }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: C.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700, color: '#fff', flexShrink: 0 }}>{STEPS[current].icon}</div>
          <p style={{ fontSize: '0.875rem', color: C.text, lineHeight: 1.5, margin: 0 }}><strong>{STEPS[current].label}:</strong> {STEPS[current].description}</p>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem', marginTop: '1.5rem' }}>
        <button onClick={play} disabled={playing} style={{ padding: '0.625rem 1.5rem', borderRadius: 8, border: 'none', fontSize: '0.875rem', fontWeight: 600, cursor: playing ? 'default' : 'pointer', background: C.primary, color: '#fff', opacity: playing ? 0.6 : 1 }}>{playing ? 'Playing...' : '▶ Play'}</button>
        <button onClick={reset} disabled={playing} style={{ padding: '0.625rem 1.5rem', borderRadius: 8, border: 'none', fontSize: '0.875rem', fontWeight: 600, cursor: playing ? 'default' : 'pointer', background: C.cardBg, color: C.text, opacity: playing ? 0.6 : 1 }}>↺ Reset</button>
      </div>
    </div>
  );
}
