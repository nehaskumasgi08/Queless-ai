# QUEUELESS AI - Don't wait. Arrive when it's your turn.

## Run it in VS Code
1. Install Node.js 18+ (https://nodejs.org), then open this folder in VS Code (File > Open Folder).
2. Open the terminal (Ctrl + `) and run:
   npm run setup     (installs everything, one time)
   npm run dev       (starts API on :4000 and web app on :5173)
3. Open http://localhost:5173

## Demo logins
patient: priya / priya123 (token A10) | nurse: nurse / nurse123 | admin: admin / admin123

## Best demo flow
Window 1: Priya (phone-size). Window 2: Nurse > Demo mode.
Press Start autopilot, or use +10 delay, +20 min clock jumps, then "Trigger 10-min alert".

No database needed: data lives in memory and resets when the server restarts.
