// QUEUELESS AI - queue engine, prediction engine, real-time server.
// Storage is in-memory (zero setup). Restarting the server resets the demo.
import express from 'express';
import http from 'http';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import { Server } from 'socket.io';

const SECRET = 'queueless-demo-secret';
const PORT = 4000;
const MIN = 60000;
const app = express();
app.use(cors());
app.use(express.json());
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

/* ---------- virtual clock (lets the demo fast-forward time) ---------- */
let clockOffset = 0;
const now = () => Date.now() + clockOffset;
const fmt = (ms) => new Date(ms).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

/* ---------- users ---------- */
const users = [
  { id: 'u_priya', username: 'priya', password: 'priya123', name: 'Priya', role: 'patient' },
  { id: 'u_nurse', username: 'nurse', password: 'nurse123', name: 'Nurse Kavya', role: 'nurse' },
  { id: 'u_admin', username: 'admin', password: 'admin123', name: 'Admin', role: 'admin' },
];

/* ---------- state ---------- */
let doctor, tokens, durations, notifs, errs, seq, autopilot = false;
const RANK = { EMERGENCY: 0, PRIORITY: 1, NORMAL: 2 };
const cmp = (a, b) => RANK[a.priority] - RANK[b.priority] || a.order - b.order;
const pad = (n) => 'A' + String(n).padStart(2, '0');

function reset() {
  const d = new Date(); d.setHours(10, 30, 0, 0);
  clockOffset = d.getTime() - Date.now();
  autopilot = false;
  users.splice(3); // drop self-registered patients
  doctor = { id: 'd1', name: 'Dr. Ananya Rao', dept: 'General Medicine', status: 'AVAILABLE', delay: 0 };
  durations = [6, 8, 5, 9, 7]; notifs = []; errs = []; seq = 15;
  const names = ['Arjun','Meera','Kiran','Sana','Vikram','Rahul','Isha','Dev','Neha','Priya','Rohan','Anita','Suresh','Divya','Karthik'];
  const t0 = now();
  tokens = names.map((n, i) => {
    const t = { token: pad(i + 1), name: n, userId: n === 'Priya' ? 'u_priya' : null, status: 'WAITING',
      priority: 'NORMAL', order: i + 1, notified: false, bookingWait: i * 7 };
    if (i < 5) Object.assign(t, { status: 'COMPLETED', duration: durations[i], endedAt: t0 - (5 - i) * 7 * MIN });
    if (i === 5) Object.assign(t, { status: 'IN_CONSULTATION', startedAt: t0 - 3 * MIN });
    return t;
  });
}
reset();

/* ---------- prediction engine ---------- */
function stats() {
  const r = durations.slice(-8);
  let w = 0, s = 0;
  r.forEach((d, i) => { w += i + 1; s += d * (i + 1); }); // recent consultations weigh more
  const wavg = s / w;
  const overall = durations.reduce((a, b) => a + b, 0) / durations.length;
  const mean = r.reduce((a, b) => a + b, 0) / r.length;
  const sd = Math.sqrt(r.reduce((a, b) => a + (b - mean) ** 2, 0) / r.length);
  return { wavg, overall, cv: sd / mean };
}
const current = () => tokens.find((t) => t.status === 'IN_CONSULTATION');
const waiting = () => tokens.filter((t) => t.status === 'WAITING').sort(cmp);
const isDown = () => doctor.status === 'UNAVAILABLE' || doctor.status === 'PAUSED';

// Pure function: also used by the What-If simulator (never mutates real data).
function predict(o = {}) {
  const st = stats();
  const avg = o.avg || st.wavg;
  let list = waiting();
  if (o.noShows) list = list.slice(o.noShows);
  if (o.priority) list = [{ dummy: true }, ...list];
  const cur = current();
  const t = now();
  const rem = cur ? Math.max(1, avg - (t - cur.startedAt) / MIN) : 0;
  const delay = (doctor.delay || 0) + (o.delay || 0);
  const out = {};
  list.forEach((x, i) => {
    if (x.dummy) return;
    let conf = 94 - st.cv * 55 - (delay > 0 ? 8 : 0) - i * 0.9;
    conf = Math.round(Math.max(45, Math.min(97, conf)));
    out[x.token] = { eta: isDown() ? null : t + (delay + rem + i * avg) * MIN, ahead: i + (cur ? 1 : 0), conf };
  });
  return { out, avg, rem };
}

/* ---------- notifications ---------- */
function notify(userId, type, title, message) {
  if (!userId) return;
  const n = { id: Math.random().toString(36).slice(2), userId, type, title, message, ts: now(), read: false, sms: type === 'APPROACHING' };
  notifs.push(n);
  io.to('user:' + userId).emit('notify', n);
}
function fire10(t, eta) {
  t.notified = true; t.predictedAtNotify = eta;
  notify(t.userId, 'APPROACHING', '🔔 YOUR TURN IS APPROACHING',
    `Hello ${t.name}, your consultation with ${doctor.name} is expected in approximately 10 minutes. Token: ${t.token}. Predicted time: ${fmt(eta)}. Please proceed to the hospital.`);
}
function checkAlerts() {
  const p = predict();
  for (const t of waiting()) {
    const r = p.out[t.token];
    if (t.userId && r?.eta && !t.notified && r.eta - now() <= 10 * MIN) fire10(t, r.eta); // sent once only
  }
}
// run an action, then tell every affected patient if their ETA moved
function withDiff(reason, fn) {
  const before = predict().out;
  fn();
  const after = predict().out;
  for (const t of waiting()) {
    if (!t.userId) continue;
    const a = before[t.token], b = after[t.token];
    if (a?.eta && !b?.eta) notify(t.userId, 'UNAVAILABLE', '🔴 DOCTOR UNAVAILABLE', 'Your appointment is being monitored. We will update your estimated time when the doctor\'s availability is confirmed.');
    else if (a?.eta && b?.eta && Math.abs(b.eta - a.eta) >= 3 * MIN)
      notify(t.userId, 'UPDATE', '⚠️ ESTIMATED TIME UPDATED', `${reason} Previous estimate: ${fmt(a.eta)}. New estimate: ${fmt(b.eta)}. We'll keep monitoring your position.`);
  }
}
const push = () => { checkAlerts(); io.emit('update'); };

/* ---------- queue actions ---------- */
function startNext() {
  if (current()) return 'A consultation is already in progress';
  const next = waiting()[0];
  if (!next) return 'No patients waiting';
  if (next.predictedAtNotify) errs.push(Math.abs(now() - next.predictedAtNotify) / MIN);
  next.status = 'IN_CONSULTATION'; next.startedAt = now();
  doctor.delay = 0; if (doctor.status === 'DELAYED') doctor.status = 'AVAILABLE';
  notify(next.userId, 'TURN', '✅ IT\'S YOUR TURN', `${doctor.name} is ready for token ${next.token}.`);
}
function complete() {
  const c = current(); if (!c) return 'Nobody is in consultation';
  c.status = 'COMPLETED'; c.endedAt = now();
  c.duration = Math.max(0.5, Math.round(((c.endedAt - c.startedAt) / MIN) * 10) / 10);
  durations.push(c.duration);
}
function autoStep() {
  const c = current();
  if (!c) { if (waiting().length && !isDown()) startNext(); return; }
  const dur = 4 + Math.random() * 8;
  const elapsed = (now() - c.startedAt) / MIN;
  if (dur > elapsed) clockOffset += (dur - elapsed) * MIN; // time flows forward
  complete();
  if (Math.random() < 0.12 && waiting().length > 2) waiting()[0].status = 'NO_SHOW';
  if (!isDown()) startNext();
}
setInterval(() => { if (autopilot) autoStep(); push(); }, 5000);

/* ---------- auth ---------- */
const sign = (u) => jwt.sign({ id: u.id }, SECRET, { expiresIn: '12h' });
const pub = (u) => ({ id: u.id, name: u.name, role: u.role, username: u.username });
function auth(req, res, next) {
  try {
    const p = jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), SECRET);
    req.user = users.find((u) => u.id === p.id);
    if (!req.user) throw 0;
    next();
  } catch { res.status(401).json({ error: 'unauth' }); }
}
const staff = (req, res, next) => (req.user.role === 'patient' ? res.status(403).json({ error: 'Staff only' }) : next());
io.use((s, next) => {
  try { const p = jwt.verify(s.handshake.auth.token, SECRET); s.join('user:' + p.id); next(); } catch { next(new Error('unauth')); }
});

app.post('/api/login', (req, res) => {
  const u = users.find((x) => x.username === (req.body.username || '').toLowerCase() && x.password === req.body.password);
  if (!u) return res.status(400).json({ error: 'Wrong username or password' });
  res.json({ token: sign(u), user: pub(u) });
});
app.post('/api/register', (req, res) => {
  const { name, username, password } = req.body;
  if (!name || !username || !password) return res.status(400).json({ error: 'Fill in all fields' });
  if (users.find((x) => x.username === username.toLowerCase())) return res.status(400).json({ error: 'Username taken' });
  const u = { id: 'u_' + Math.random().toString(36).slice(2, 8), username: username.toLowerCase(), password, name, role: 'patient' };
  users.push(u);
  res.json({ token: sign(u), user: pub(u) });
});

/* ---------- state view ---------- */
app.get('/api/state', auth, (req, res) => {
  const u = req.user, isStaff = u.role !== 'patient';
  const p = predict(), st = stats(), cur = current(), wl = waiting();
  const view = (x) => ({
    token: x.token, status: x.status, priority: x.priority, duration: x.duration, startedAt: x.startedAt,
    eta: p.out[x.token]?.eta ?? null, ahead: p.out[x.token]?.ahead, conf: p.out[x.token]?.conf,
    mine: x.userId === u.id, notified: x.notified, hasApp: !!x.userId,
    name: isStaff || x.userId === u.id ? x.name : null,
  });
  const queue = [...tokens.filter((t) => t.status === 'COMPLETED').slice(-3), ...(cur ? [cur] : []), ...wl,
    ...(isStaff ? tokens.filter((t) => t.status === 'NO_SHOW' || t.status === 'CANCELLED').slice(-4) : [])].map(view);
  const mine = tokens.filter((t) => t.userId === u.id);
  const me = mine.find((t) => ['WAITING', 'IN_CONSULTATION'].includes(t.status)) || mine[mine.length - 1];
  const trendDiff = st.wavg - st.overall;
  const rec3 = durations.slice(-3).reduce((a, b) => a + b, 0) / Math.min(3, durations.length);
  const soon = wl.filter((t) => p.out[t.token]?.eta && p.out[t.token].eta - now() <= 15 * MIN).length;
  const insights = [];
  if (doctor.delay > 0) insights.push(`${doctor.name} is currently running approximately ${doctor.delay} minutes behind schedule.`);
  if (isDown()) insights.push('Doctor is unavailable. Estimates are paused to avoid showing false times.');
  insights.push(trendDiff > 0.8 ? `Consultations are trending ${trendDiff.toFixed(1)} minutes longer than the day's average. Queue is moving slower than usual.`
    : trendDiff < -0.8 ? `Consultations are ${Math.abs(trendDiff).toFixed(1)} minutes faster than the day's average. Later tokens may be called earlier.`
    : 'Consultation speed is stable. Queue is moving as expected.');
  if (soon) insights.push(`${soon} patient${soon > 1 ? 's are' : ' is'} approaching their predicted arrival window.`);
  const noShows = tokens.filter((t) => t.status === 'NO_SHOW').length;
  const notified = tokens.filter((t) => t.notified);
  const out = {
    now: now(), doctor, autopilot, queue, me: me ? view(me) : null, insights,
    avg: { weighted: +st.wavg.toFixed(1), overall: +st.overall.toFixed(1), recent: +rec3.toFixed(1), trend: trendDiff > 0.8 ? 'Slower' : trendDiff < -0.8 ? 'Faster' : 'Stable' },
    confidence: p.out[wl[0]?.token]?.conf ?? 0,
    counts: { total: tokens.length, completed: tokens.filter((t) => t.status === 'COMPLETED').length, waiting: wl.length, inConsultation: cur ? 1 : 0, noShow: noShows },
    notifications: notifs.filter((n) => n.userId === u.id).slice().reverse(),
  };
  if (u.role === 'admin') {
    out.analytics = {
      avgConsult: +st.overall.toFixed(1), noShowPct: Math.round((noShows / tokens.length) * 100),
      notifiedCount: notified.length, avoidedMinutes: Math.round(notified.reduce((a, t) => a + Math.max(0, t.bookingWait - 10), 0)),
      predError: errs.length ? +(errs.reduce((a, b) => a + b, 0) / errs.length).toFixed(1) : null,
      history: durations.map((d, i) => ({ i: i + 1, d })),
    };
  }
  res.json(out);
});

/* ---------- patient actions ---------- */
app.post('/api/book', auth, (req, res) => {
  const u = req.user;
  if (tokens.some((t) => t.userId === u.id && ['WAITING', 'IN_CONSULTATION'].includes(t.status))) return res.status(400).json({ error: 'You already have an active appointment' });
  if (doctor.status === 'UNAVAILABLE') return res.status(400).json({ error: 'Doctor is unavailable right now' });
  seq++;
  const ahead = waiting().length + (current() ? 1 : 0);
  tokens.push({ token: pad(seq), name: u.name, userId: u.id, status: 'WAITING', priority: 'NORMAL', order: seq, notified: false, bookingWait: Math.round(ahead * stats().wavg) });
  push(); res.json({ ok: true });
});
app.post('/api/cancel', auth, (req, res) => {
  const t = tokens.find((x) => x.userId === req.user.id && x.status === 'WAITING');
  if (!t) return res.status(400).json({ error: 'Nothing to cancel' });
  withDiff('A patient ahead of you cancelled.', () => { t.status = 'CANCELLED'; });
  push(); res.json({ ok: true });
});
app.post('/api/notifications/read', auth, (req, res) => { notifs.forEach((n) => { if (n.userId === req.user.id) n.read = true; }); res.json({ ok: true }); });

/* ---------- staff actions ---------- */
const done = (res, err) => { if (err) return res.status(400).json({ error: err }); push(); res.json({ ok: true }); };
app.post('/api/queue/start', auth, staff, (req, res) => done(res, startNext()));
app.post('/api/queue/complete', auth, staff, (req, res) => done(res, complete()));
app.post('/api/queue/next', auth, staff, (req, res) => { const e = current() ? complete() : null; done(res, e || startNext()); });
app.post('/api/queue/noshow', auth, staff, (req, res) => {
  const t = tokens.find((x) => x.token === req.body.token && x.status === 'WAITING');
  if (!t) return done(res, 'Token not waiting');
  withDiff('A patient ahead of you did not show up.', () => { t.status = 'NO_SHOW'; }); done(res);
});
app.post('/api/queue/cancel', auth, staff, (req, res) => {
  const t = tokens.find((x) => x.token === req.body.token && x.status === 'WAITING');
  if (!t) return done(res, 'Token not waiting');
  withDiff('A patient ahead of you cancelled.', () => { t.status = 'CANCELLED'; }); done(res);
});
app.post('/api/queue/priority', auth, staff, (req, res) => {
  const t = tokens.find((x) => x.token === req.body.token && x.status === 'WAITING');
  if (!t || !Object.prototype.hasOwnProperty.call(RANK, req.body.level)) return done(res, 'Invalid request');
  withDiff('Queue prediction updated because a priority case was added by hospital staff.', () => { t.priority = req.body.level; }); done(res);
});
app.post('/api/doctor', auth, staff, (req, res) => {
  const { status, delay } = req.body;
  withDiff(status === 'DELAYED' ? `${doctor.name} is currently delayed.` : 'Doctor availability changed.', () => {
    if (status === 'DELAYED') { doctor.status = 'DELAYED'; doctor.delay += Number(delay) || 10; }
    else if (['AVAILABLE', 'UNAVAILABLE', 'PAUSED'].includes(status)) { doctor.status = status; doctor.delay = 0; }
  });
  done(res);
});

/* ---------- What-If simulator (read-only) ---------- */
const SCEN = {
  delay20: { delay: 20 }, noshow3: { noShows: 3 }, slow10: { avg: 10 }, priority: { priority: true }, unavail30: { delay: 30 },
};
app.post('/api/whatif', auth, staff, (req, res) => {
  const o = SCEN[req.body.scenario]; if (!o) return res.status(400).json({ error: 'Unknown scenario' });
  const base = predict(), sim = predict(o);
  const rows = Object.keys(sim.out).slice(0, 10).map((k) => ({ token: k, base: base.out[k].eta, sim: sim.out[k].eta }));
  res.json({ rows, now: now() });
});

/* ---------- Demo mode ---------- */
app.post('/api/demo/advance', auth, staff, (req, res) => { clockOffset += (Number(req.body.minutes) || 5) * MIN; push(); res.json({ ok: true }); });
app.post('/api/demo/autopilot', auth, staff, (req, res) => { autopilot = !!req.body.on; push(); res.json({ ok: true }); });
app.post('/api/demo/trigger10', auth, staff, (req, res) => {
  const t = tokens.find((x) => x.userId === (req.body.userId || 'u_priya') && x.status === 'WAITING');
  if (!t) return res.status(400).json({ error: 'Demo patient has no waiting token' });
  fire10(t, predict().out[t.token]?.eta || now() + 10 * MIN); push(); res.json({ ok: true });
});
app.post('/api/demo/reset', auth, staff, (req, res) => { reset(); io.emit('update'); res.json({ ok: true }); });

server.listen(PORT, () => console.log(`QUEUELESS AI API running on http://localhost:${PORT}`));
