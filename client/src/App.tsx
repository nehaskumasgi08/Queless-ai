import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { api, getToken } from './api';
import Patient from './Patient';
import Staff from './Staff';

export const Ecg = () => (
  <svg className="ecg" viewBox="0 0 46 22"><polyline points="0,11 10,11 14,3 19,19 24,11 46,11" /></svg>
);

function Login({ onAuth }: { onAuth: (d: any) => void }) {
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [f, setF] = useState({ name: '', username: '', password: '' });
  const [err, setErr] = useState('');
  const go = async (u?: string, p?: string) => {
    try {
      setErr('');
      const d = u ? await api('/login', 'POST', { username: u, password: p })
        : mode === 'in' ? await api('/login', 'POST', f) : await api('/register', 'POST', f);
      onAuth(d);
    } catch (e: any) { setErr(e.message); }
  };
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="wrap">
      <div className="top"><div className="brand"><Ecg /> QUEUELESS AI</div></div>
      <div className="hero">
        <h1 style={{ fontSize: '2.1rem', lineHeight: 1.05 }}>Don't wait.<br />Arrive when it's your turn.</h1>
        <p className="mute" style={{ marginBottom: 0 }}>Book from home. We predict your real turn, recalculate it live, and tell you when to leave.</p>
      </div>
      <div className="card">
        <h3>{mode === 'in' ? 'Sign in' : 'Create patient account'}</h3>
        <div className="grid" style={{ marginTop: 12 }}>
          {mode === 'up' && <input placeholder="Full name" value={f.name} onChange={set('name')} />}
          <input placeholder="Username" value={f.username} onChange={set('username')} autoCapitalize="none" />
          <input placeholder="Password" type="password" value={f.password} onChange={set('password')} />
          {err && <div className="err">{err}</div>}
          <button className="teal" onClick={() => go()}>{mode === 'in' ? 'Sign in' : 'Create account'}</button>
          <button className="ghost" onClick={() => setMode(mode === 'in' ? 'up' : 'in')}>{mode === 'in' ? 'New patient? Create account' : 'I have an account'}</button>
        </div>
      </div>
      <div className="card">
        <h3>Try the demo</h3>
        <p className="mute">One tap sign-in. Open the patient and the nurse in two browser windows to see live updates.</p>
        <div className="grid">
          <button className="teal" onClick={() => go('priya', 'priya123')}>Patient: Priya (token A10)</button>
          <button onClick={() => go('nurse', 'nurse123')}>Nurse: control desk and demo mode</button>
          <button className="ghost" onClick={() => go('admin', 'admin123')}>Admin: analytics and operations</button>
        </div>
      </div>
      <p className="mute">QUEUELESS AI manages appointments and queues only. It does not diagnose or give medical advice. Priority is always set by hospital staff.</p>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState<any>(() => { try { return JSON.parse(localStorage.getItem('ql_user') || 'null'); } catch { return null; } });
  const [s, setS] = useState<any>(null);
  const [skew, setSkew] = useState(0);
  const [lastAt, setLastAt] = useState(Date.now());
  const [, tick] = useState(0);
  const [alert, setAlert] = useState<any>(null);
  const [voice, setVoice] = useState(() => localStorage.getItem('ql_voice') !== 'off');
  const voiceRef = useRef(voice);
  voiceRef.current = voice;

  const logout = () => { localStorage.removeItem('ql_token'); localStorage.removeItem('ql_user'); setUser(null); setS(null); };
  const onAuth = (d: any) => { localStorage.setItem('ql_token', d.token); localStorage.setItem('ql_user', JSON.stringify(d.user)); setUser(d.user); };

  const load = useCallback(async () => {
    try {
      const d = await api('/state');
      setS(d); setSkew(d.now - Date.now()); setLastAt(Date.now());
    } catch (e: any) { if (e.message === 'unauth') logout(); }
  }, []);

  useEffect(() => {
    if (!user) return;
    load();
    const sock = io({ auth: { token: getToken() } });
    sock.on('update', load);
    sock.on('notify', (n: any) => {
      load();
      if (n.type === 'APPROACHING' || n.type === 'TURN') {
        setAlert(n);
        if (voiceRef.current && 'speechSynthesis' in window)
          window.speechSynthesis.speak(new SpeechSynthesisUtterance(n.type === 'TURN' ? 'It is your turn. Please go in.' : 'Your turn is approaching. Please proceed to the hospital.'));
      }
      if ('Notification' in window && Notification.permission === 'granted') new Notification(n.title, { body: n.message });
    });
    const id = setInterval(() => tick((x) => x + 1), 1000);
    return () => { sock.close(); clearInterval(id); };
  }, [user]);

  const clock = () => Date.now() + skew;
  if (!user) return <Login onAuth={onAuth} />;
  if (!s) return <div className="wrap"><p className="mute">Connecting to the queue...</p></div>;
  const shared = { s, clock, lastAt, user, logout, reload: load };
  return (
    <>
      {user.role === 'patient'
        ? <Patient {...shared} voice={voice} setVoice={(v: boolean) => { setVoice(v); localStorage.setItem('ql_voice', v ? 'on' : 'off'); }} />
        : <Staff {...shared} />}
      {alert && (
        <div className="overlay" onClick={() => setAlert(null)}>
          <div>
            <div className="pulse">{alert.type === 'TURN' ? '✅' : '🔔'}</div>
            <h1 style={{ fontSize: '2rem' }}>{alert.title.replace(/^\S+\s/, '')}</h1>
            <p style={{ maxWidth: 420, margin: '14px auto', fontSize: '1.05rem', lineHeight: 1.5 }}>{alert.message}</p>
            {alert.sms && <p className="mute">A text message was also sent to your phone (simulated).</p>}
            <button className="teal bigbtn" onClick={() => setAlert(null)}>I'm on my way</button>
          </div>
        </div>
      )}
    </>
  );
}
