/*
 * pm2 process file: keeps the server running, restarts it if it crashes, and
 * starts it again after the machine reboots (with `pm2 startup` + `pm2 save`).
 *
 *   npm i -g pm2                 # once, on the server
 *   npm run build:client         # build the website the server serves
 *   npm run prod:start           # start
 *   npm run prod:logs            # watch logs
 *   npm run prod:restart         # after pulling new code
 *
 * Keep instances at 1. Rate limits, the payment check job, the gate config
 * cache and live updates all live in this one process; several copies would
 * each keep their own and disagree.
 */
module.exports = {
  apps: [
    {
      name: 'flashpass',
      script: 'server/src/server.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 50,
      exp_backoff_restart_delay: 200,  // back off if it keeps crashing (e.g. database down)
      max_memory_restart: '700M',
      kill_timeout: 5000,
      time: true,                      // timestamps in logs
      merge_logs: true,
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};
