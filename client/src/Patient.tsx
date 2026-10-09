import { useState } from 'react';
import { api } from './api';
import { Ecg } from './App';

const t12 = (ms: number) => new Date(ms).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
const mmss = (ms: number) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`; };

function LeaveRing({ eta, clock }: { eta: number; clock: () => number }) {
  const [travel, setTravel] = useState(() => Number(localStorage.getItem('ql_travel') || 20));
  const buffer = 5;
  const leaveIn = eta - (travel + buffer) * 60000 - clock();
  const frac = Math.max(0, Math.min(1, leaveIn / (60 * 60000)));
  const R = 56, C = 2 * Math.PI * R, go = leaveIn <= 0;
  return (
    <div className="card">
      <h3>Smart leave timer</h3>
      <p className="mute" style={{ marginTop: 4 }}>Based on your predicted turn, your travel time, and a {buffer} minute buffer.</p>
      <div className="ringbox">
        <div className={'ring' + (go ? ' now' : '')}>
          <svg width="132" height="132"><circle cx="66" cy="66" r={R} fill="none" stroke="#e4ecea" strokeWidth="12" />
            <circle className="fg" cx="66" cy="66" r={R} fill="none" stroke="#0f8b8d" strokeWidth="12" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - frac)} style={{ transition: 'stroke-dashoffset 1s linear' }} /></svg>
          <div className="t">{go ? <span style={{ color: '#e4572e' }}>LEAVE<br />NOW</span> : <span>{mmss(leaveIn)}<br /><small className="mute">until you leave</small></span>}</div>
        </div>
        <div style={{ flex: 1 }}>
          <label className="mute">Travel time: <b>{travel} min</b></label>
          <input type="range" min={5} max={90} step={5} value={travel} onChange={(e) => { setTravel(+e.target.value); localStorage.setItem('ql_travel', e.target.value); }} />
          <div className="mute" style={{ marginTop: 6 }}>Arrive around <b>{t12(eta - buffer * 60000)}</b></div>
        </div>
      </div>
    </div>
  );
}

function Road({ queue }: { queue: any[] }) {
  const cur = queue.find((q) => q.status === 'IN_CONSULTATION');
  const wait = queue.filter((q) => q.status === 'WAITING').slice(0, 12).reverse();
  return (
    <div className="card">
      <h3>The road to your turn</h3>
      <div className="road" style={{ marginTop: 10 }}>
        {wait.map((q) => <div key={q.token} className={'dot' + (q.mine ? ' me' : '')}>{q.mine ? 'YOU' : q.token}</div>)}
        {cur && <div className={'dot cur'}>{cur.token}</div>}
        <div className="hosp">🏥</div>
      </div>
      <p className="mute" style={{ marginBottom: 0 }}>Tokens move toward the doctor as the nurse completes consultations.</p>
    </div>
  );
}

export default function Patient({ s, clock, lastAt, user, logout, reload, voice, setVoice }: any) {
  const [tab, setTab] = useState('home');
  const [err, setErr] = useState('');
  const me = s.me, active = me && ['WAITING', 'IN_CONSULTATION'].includes(me.status);
  const unread = s.notifications.filter((n: any) => !n.read).length;
  const down = ['UNAVAILABLE', 'PAUSED'].includes(s.doctor.status);
  const act = async (fn: () => Promise<any>) => { try { setErr(''); await fn(); reload(); } catch (e: any) { setErr(e.message); } };
  const secs = Math.max(0, Math.round((Date.now() - lastAt) / 1000));
  const dChip = { AVAILABLE: ['green', '🟢 Available'], DELAYED: ['amber', '🟡 Delayed'], UNAVAILABLE: ['coral', '🔴 Unavailable'], PAUSED: ['amber', '⏸ Paused'] }[s.doctor.status as string] || ['', ''];
  const conf = me?.conf ?? s.confidence;
  const done = s.counts.completed + s.counts.noShow;

  return (
    <div className="wrap">
      <div className="top"><div className="brand"><Ecg /> QUEUELESS AI</div><span className="mute">Hi, {user.name}</span></div>
      {err && <div className="err">{err}</div>}

      {tab === 'home' && (!active ? (
        <>
          {me && me.status !== 'WAITING' && <div className="card"><b>Last appointment {me.token}: {me.status.replace('_', ' ').toLowerCase()}.</b></div>}
          <div className="card">
            <h2>Book an appointment</h2>
            <div className="card" style={{ background: '#f4f7f6', marginTop: 12 }}>
              <div className="row between"><b>{s.doctor.name}</b><span className={'chip ' + dChip[0]}>{dChip[1]}</span></div>
              <div className="mute">{s.doctor.dept}</div>
              <div className="row" style={{ marginTop: 10, gap: 24 }}>
                <div className="stat"><b>{s.counts.waiting + s.counts.inConsultation}</b><span className="mute">in queue</span></div>
                <div className="stat"><b>~{Math.round((s.counts.waiting + s.counts.inConsultation) * s.avg.weighted)} min</b><span className="mute">approx. wait</span></div>
              </div>
            </div>
            <button className="teal bigbtn" style={{ width: '100%' }} onClick={() => act(() => api('/book', 'POST'))}>Book appointment</button>
            <p className="mute">You get a token now. You do not need to wait at the hospital. We'll tell you when to come.</p>
          </div>
        </>
      ) : (
        <>
          <div className="hero">
            <div className="row between"><span className="mute">Your token</span><span className={'chip ' + dChip[0]}>{dChip[1]}</span></div>
            <div className="token">{me.token}</div>
            <div className="mute">{s.doctor.name} · {s.doctor.dept}</div>
            {me.status === 'IN_CONSULTATION' ? <div className="eta" style={{ margin: '14px 0' }}>It's your turn. Please go in.</div>
              : down || !me.eta ? <div style={{ margin: '14px 0' }}><div className="eta" style={{ fontSize: '1.3rem' }}>Doctor currently unavailable</div>
                <div className="mute">Your appointment is being monitored. We'll update your estimated time when the doctor's availability is confirmed.</div></div>
              : <>
                <div className="mute" style={{ marginTop: 12 }}>Predicted turn</div>
                <div className="eta">{t12(me.eta)}</div>
                <div className="row stat" style={{ gap: 28, margin: '10px 0' }}>
                  <div><b>{me.ahead}</b><span className="mute">patients ahead</span></div>
                  <div><b>~{Math.max(0, Math.round((me.eta - clock()) / 60000))} min</b><span className="mute">estimated wait</span></div>
                </div>
                <div className="mute">Confidence {conf}%</div>
                <div className="bar"><i style={{ width: conf + '%' }} /></div>
                <div className="mute" style={{ marginTop: 6, fontSize: '.78rem' }}>{conf < 65 ? 'Prediction may change due to recent consultation variability.' : 'Based on recent consultation consistency and current queue stability.'}</div>
              </>}
          </div>
          {me.status === 'WAITING' && !down && me.eta && <LeaveRing eta={me.eta} clock={clock} />}
          <div className="card">
            <div className="row between"><b>Queue progress</b><span className="mute">{done} of {s.counts.total} done</span></div>
            <div className="bar" style={{ margin: '8px 0' }}><i style={{ width: (done / s.counts.total) * 100 + '%' }} /></div>
            <div className="mute">Last updated {secs} seconds ago · Estimates are predictions, not guarantees.</div>
          </div>
          <Road queue={s.queue} />
          {me.status === 'WAITING' && <button className="ghost" style={{ width: '100%' }} onClick={() => act(() => api('/cancel', 'POST'))}>Cancel my appointment</button>}
        </>
      ))}

      {tab === 'queue' && (
        <div>
          <h2 style={{ marginBottom: 12 }}>Live queue</h2>
          {s.queue.map((q: any) => (
            <div key={q.token} className={'qrow ' + (q.mine ? 'me ' : '') + (q.status === 'IN_CONSULTATION' ? 'cur ' : '') + (q.status === 'COMPLETED' ? 'done' : '')}>
              <div><b>{q.token}</b> {q.mine && <span className="chip amber">You</span>} {q.priority !== 'NORMAL' && <span className="chip blue">Priority set by staff</span>}</div>
              <span className="mute">{q.status === 'COMPLETED' ? '✓ Done' : q.status === 'IN_CONSULTATION' ? '🟢 With doctor' : q.eta ? '~' + t12(q.eta) : 'Waiting'}</span>
            </div>
          ))}
        </div>
      )}

      {tab === 'alerts' && (
        <div>
          <div className="row between"><h2>Notifications</h2><button className="ghost" onClick={() => act(() => api('/notifications/read', 'POST'))}>Mark all read</button></div>
          {s.notifications.length === 0 && <p className="mute">Nothing yet. We'll message you here when your turn gets close or your estimate changes.</p>}
          {s.notifications.map((n: any) => (
            <div key={n.id} className={'notif' + (n.read ? '' : ' un')}>
              <div className="row between"><b>{n.title}</b><span className="mute">{t12(n.ts)}</span></div>
              <div style={{ margin: '6px 0' }}>{n.message}</div>
              {n.sms && <span className="sms">📱 SMS sent (simulated)</span>}
            </div>
          ))}
        </div>
      )}

      {tab === 'me' && (
        <div className="card">
          <h2>{user.name}</h2>
          <p className="mute">Patient account</p>
          <div className="grid">
            <button className="ghost" onClick={() => setVoice(!voice)}>Voice announcements: {voice ? 'On' : 'Off'}</button>
            <button className="ghost" onClick={() => 'Notification' in window && Notification.requestPermission()}>Enable browser notifications</button>
            <button onClick={logout}>Sign out</button>
          </div>
        </div>
      )}

      <div className="nav">
        {[['home', '🏠', 'Home'], ['queue', '📋', 'Live queue'], ['alerts', '🔔', 'Alerts'], ['me', '👤', 'Profile']].map(([k, i, l]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}><span>{i}</span>{l}{k === 'alerts' && unread > 0 && <i className="badge">{unread}</i>}</button>
        ))}
      </div>
    </div>
  );
}
