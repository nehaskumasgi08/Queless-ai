import { useState } from 'react';
import { api } from './api';
import { Ecg } from './App';

const t12 = (ms: number) => new Date(ms).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
const mmss = (ms: number) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };

function Chart({ rows, now }: { rows: any[]; now: number }) {
  const W = 600, H = 220, P = 34;
  const mins = (v: number) => (v - now) / 60000;
  const max = Math.max(10, ...rows.flatMap((r) => [r.base, r.sim]).filter(Boolean).map(mins));
  const x = (i: number) => P + (i * (W - 2 * P)) / Math.max(1, rows.length - 1);
  const y = (v: number) => H - P - (mins(v) / max) * (H - 2 * P);
  const path = (k: string) => rows.map((r, i) => (r[k] ? `${i ? 'L' : 'M'}${x(i)},${y(r[k])}` : '')).join(' ');
  return (
    <div style={{ overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ minWidth: 420, width: '100%' }}>
        {[0, 0.5, 1].map((f) => <g key={f}><line x1={P} x2={W - P} y1={H - P - f * (H - 2 * P)} y2={H - P - f * (H - 2 * P)} stroke="#1b474e" /><text x={4} y={H - P - f * (H - 2 * P) + 4} fill="#8fb1b3" fontSize="11">{Math.round(max * f)}m</text></g>)}
        <path d={path('base')} fill="none" stroke="#5fd3b0" strokeWidth="3" />
        <path d={path('sim')} fill="none" stroke="#f2a541" strokeWidth="3" strokeDasharray="7 5" />
        {rows.map((r, i) => <text key={r.token} x={x(i)} y={H - 10} fill="#8fb1b3" fontSize="11" textAnchor="middle">{r.token}</text>)}
      </svg>
      <div className="row mute" style={{ gap: 18 }}><span style={{ color: '#5fd3b0' }}>━ Current prediction</span><span style={{ color: '#f2a541' }}>┅ Simulated</span><span>minutes from now</span></div>
    </div>
  );
}

export default function Staff({ s, clock, user, logout, reload }: any) {
  const [tab, setTab] = useState('queue');
  const [err, setErr] = useState('');
  const [wi, setWi] = useState<any>(null);
  const [scen, setScen] = useState('delay20');
  const cur = s.queue.find((q: any) => q.status === 'IN_CONSULTATION');
  const wait = s.queue.filter((q: any) => q.status === 'WAITING');
  const act = async (path: string, body?: any) => { try { setErr(''); await api(path, 'POST', body); reload(); } catch (e: any) { setErr(e.message); } };
  const a = s.analytics;
  const tabs = [['queue', 'Live queue'], ['whatif', 'What-if simulator'], ['insights', 'AI insights'], ...(user.role === 'admin' ? [['analytics', 'Analytics']] : []), ['demo', '🎬 Demo mode']];
  const dcls: any = { AVAILABLE: 'green', DELAYED: 'amber', UNAVAILABLE: 'coral', PAUSED: 'amber' };

  return (
    <div className="staff"><div className="wrap wide">
      <div className="top">
        <div className="brand"><Ecg /> QUEUELESS AI <span className="chip">{user.role === 'admin' ? 'Admin' : 'Nurse'} desk</span></div>
        <div className="row"><span className="mute">🕐 {t12(clock())} {s.autopilot && <span className="chip amber">autopilot</span>}</span><button className="ghost" onClick={logout}>Sign out</button></div>
      </div>
      <div className="grid g4" style={{ marginBottom: 14 }}>
        {[['Waiting', s.counts.waiting], ['In consultation', s.counts.inConsultation], ['Completed', s.counts.completed], ['No-shows', s.counts.noShow], ['Avg consult', s.avg.weighted + ' min'], ['Doctor delay', s.doctor.delay + ' min']].map(([l, v]) => (
          <div key={l as string} className="card scard" style={{ margin: 0 }}><span className="mute">{l}</span><b>{v}</b></div>
        ))}
      </div>
      <div className="tabs">{tabs.map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
      {err && <div className="err">{err}</div>}

      {tab === 'queue' && (
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))' }}>
          <div>
            <div className="card">
              <div className="row between"><b>Now with {s.doctor.name}</b><span className={'chip ' + dcls[s.doctor.status]}>{s.doctor.status}</span></div>
              {cur ? <>
                <div className="row between" style={{ marginTop: 8 }}><div><div className="big" style={{ fontSize: '2.4rem', fontWeight: 800 }}>{cur.token}</div><div className="mute">{cur.name}</div></div><div className="timer">{mmss(clock() - cur.startedAt)}</div></div>
                <div className="row wrapx" style={{ marginTop: 10 }}>
                  <button className="green bigbtn" onClick={() => act('/queue/complete')}>Complete consultation</button>
                  <button className="teal bigbtn" onClick={() => act('/queue/next')}>Complete and call next</button>
                </div>
              </> : <div style={{ marginTop: 10 }}><p className="mute">Nobody is in consultation.</p><button className="green bigbtn" disabled={!wait.length} onClick={() => act('/queue/start')}>Start next patient</button></div>}
            </div>
            <div className="card">
              <b>Doctor status</b>
              <div className="row wrapx" style={{ marginTop: 10 }}>
                <button className="green" onClick={() => act('/doctor', { status: 'AVAILABLE' })}>Available</button>
                {[10, 20, 30].map((m) => <button key={m} className="amber" onClick={() => act('/doctor', { status: 'DELAYED', delay: m })}>Delay +{m}</button>)}
                <button className="coral" onClick={() => act('/doctor', { status: 'UNAVAILABLE' })}>Unavailable</button>
                <button className="ghost" onClick={() => act('/doctor', { status: 'PAUSED' })}>Pause queue</button>
              </div>
              <p className="mute" style={{ marginBottom: 0 }}>Patients are notified automatically when their estimate moves. Nobody is moved to another doctor without staff confirmation.</p>
            </div>
          </div>
          <div className="card">
            <b>Waiting ({wait.length})</b>
            <div style={{ marginTop: 10, maxHeight: 520, overflowY: 'auto' }}>
              {s.queue.filter((q: any) => q.status !== 'COMPLETED' && q.status !== 'IN_CONSULTATION').map((q: any) => (
                <div key={q.token} className={'qrow' + (q.mine ? ' me' : '')} style={{ opacity: q.status === 'WAITING' ? 1 : 0.5 }}>
                  <div><b>{q.token}</b> {q.name} {q.hasApp && <span className="chip blue">app</span>} {q.priority !== 'NORMAL' && <span className="chip amber">{q.priority}</span>} {q.notified && <span className="chip green">notified</span>}
                    <div className="mute">{q.status === 'WAITING' ? (q.eta ? `~${t12(q.eta)} · ${q.conf}% confidence` : 'estimate paused') : q.status.replace('_', '-')}</div></div>
                  {q.status === 'WAITING' && <div className="row">
                    <button className="ghost" title="No-show" onClick={() => act('/queue/noshow', { token: q.token })}>No-show</button>
                    <button className="ghost" title="Cancel" onClick={() => act('/queue/cancel', { token: q.token })}>✕</button>
                    <select value={q.priority} onChange={(e) => act('/queue/priority', { token: q.token, level: e.target.value })} title="Priority is set by staff only">
                      <option>NORMAL</option><option>PRIORITY</option><option>EMERGENCY</option>
                    </select>
                  </div>}
                </div>
              ))}
            </div>
            <p className="mute">Priority is always assigned by hospital staff. The AI never judges medical urgency.</p>
          </div>
        </div>
      )}

      {tab === 'whatif' && (
        <div className="card">
          <h2>🔮 What-if simulator</h2>
          <p className="mute">Test a scenario. This never changes the real queue.</p>
          <div className="row wrapx">
            <select value={scen} onChange={(e) => setScen(e.target.value)}>
              <option value="delay20">Doctor delayed by 20 minutes</option><option value="noshow3">3 patients become no-shows</option>
              <option value="slow10">Average consultation rises to 10 min</option><option value="priority">One priority patient added</option>
              <option value="unavail30">Doctor unavailable for 30 minutes</option>
            </select>
            <button className="teal" onClick={async () => { try { setErr(''); setWi(await api('/whatif', 'POST', { scenario: scen })); } catch (e: any) { setErr(e.message); } }}>Run simulation</button>
          </div>
          {wi && <div style={{ marginTop: 14 }}>
            <Chart rows={wi.rows} now={wi.now} />
            <div className="grid g4" style={{ marginTop: 10 }}>{wi.rows.slice(0, 4).map((r: any) => <div key={r.token} className="qrow"><b>{r.token}</b><span>{r.base ? t12(r.base) : '-'} → <b style={{ color: '#f2a541' }}>{t12(r.sim)}</b></span></div>)}</div>
          </div>}
        </div>
      )}

      {tab === 'insights' && (
        <div className="card">
          <h2>🧠 AI queue insights</h2>
          {s.insights.map((i: string, k: number) => <div key={k} className="qrow"><span>{i}</span></div>)}
          <div className="grid g4" style={{ marginTop: 10 }}>
            <div className="card scard"><span className="mute">Average consultation</span><b>{s.avg.overall} min</b></div>
            <div className="card scard"><span className="mute">Weighted recent</span><b>{s.avg.weighted} min</b></div>
            <div className="card scard"><span className="mute">Prediction trend</span><b>{s.avg.trend}</b></div>
            <div className="card scard"><span className="mute">Queue confidence</span><b>{s.confidence}%</b></div>
          </div>
          <p className="mute">Insights are operational only. They never include medical judgement.</p>
        </div>
      )}

      {tab === 'analytics' && a && (
        <div className="card">
          <h2>Analytics</h2>
          <div className="grid g4">
            <div className="card scard"><span className="mute">Avg consultation</span><b>{a.avgConsult} min</b></div>
            <div className="card scard"><span className="mute">No-show rate</span><b>{a.noShowPct}%</b></div>
            <div className="card scard"><span className="mute">Patients notified</span><b>{a.notifiedCount}</b></div>
            <div className="card scard"><span className="mute">Waiting-room minutes saved</span><b>{a.avoidedMinutes}</b></div>
            <div className="card scard"><span className="mute">Avg prediction error</span><b>{a.predError === null ? 'n/a yet' : a.predError + ' min'}</b></div>
          </div>
          <div className="qrow" style={{ marginTop: 10 }}><span>Waiting time, traditional vs QUEUELESS: <b>42 min → 19 min</b></span><span className="chip amber">DEMO / SIMULATED</span></div>
          <p className="mute">Other figures above are calculated from this session's data. Minutes saved = predicted wait at booking minus the 10 minutes a notified patient waits on site.</p>
        </div>
      )}

      {tab === 'demo' && (
        <div className="card demo">
          <h2>🎬 Hackathon demo mode</h2>
          <p className="mute">Open the patient (priya / priya123) in another window, then drive the story from here.</p>
          <div className="row wrapx" style={{ marginBottom: 12 }}>
            <button className={s.autopilot ? 'coral bigbtn' : 'green bigbtn'} onClick={() => act('/demo/autopilot', { on: !s.autopilot })}>{s.autopilot ? '⏹ Stop autopilot' : '▶ Start autopilot'}</button>
            <span className="mute">Autopilot runs the whole clinic: consultations finish, no-shows happen, ETAs shift live.</span>
          </div>
          <div className="row wrapx">
            <button className="teal" onClick={() => act('/queue/next')}>Next consultation</button>
            <button className="teal" onClick={() => act('/queue/complete')}>Complete current</button>
            <button className="amber" onClick={() => act('/doctor', { status: 'DELAYED', delay: 10 })}>Doctor delay +10</button>
            <button className="amber" onClick={() => act('/doctor', { status: 'DELAYED', delay: 20 })}>Doctor delay +20</button>
            <button className="ghost" onClick={() => wait[0] && act('/queue/noshow', { token: wait[0].token })}>Mark next as no-show</button>
            <button className="ghost" onClick={() => wait[2] && act('/queue/priority', { token: wait[2].token, level: 'PRIORITY' })}>Add priority</button>
          </div>
          <div className="row wrapx" style={{ marginTop: 10 }}>
            <span className="mute">Fast-forward the clock:</span>
            {[5, 10, 20].map((m) => <button key={m} className="blue" onClick={() => act('/demo/advance', { minutes: m })}>+{m} min</button>)}
            <button className="coral" onClick={() => act('/demo/trigger10')}>🔔 Trigger 10-min alert for Priya</button>
            <button className="ghost" onClick={() => act('/demo/reset')}>Reset demo</button>
          </div>
        </div>
      )}
    </div></div>
  );
}
