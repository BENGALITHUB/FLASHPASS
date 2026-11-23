import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import Header from '../components/common/Header';
import {
  AlertCircle, User, Crown, Briefcase, Banknote, ScanLine, Delete, RefreshCw,
  KeyRound, Zap, ShieldCheck
} from 'lucide-react';

// Staff roles + demo credentials (tap a role tab to auto-fill)
const ROLES = [
  { username: 'admin', pin: '123456', title: 'Super Admin', access: 'All zones • All events', icon: Crown, color: '#FFD60A', ink: '#111' },
  { username: 'carnival_admin', pin: '333333', title: 'Event Admin', access: 'Event HQ • Reports', icon: Briefcase, color: '#FF2E88', ink: '#fff' },
  { username: 'cashier1', pin: '111111', title: 'Cashier', access: 'Box office • Cash desk', icon: Banknote, color: '#F59E0B', ink: '#111' },
  { username: 'gate1', pin: '222222', title: 'Gate Crew', access: 'Gate entry • Exit', icon: ScanLine, color: '#22D3EE', ink: '#111' }
];
const GUEST = { title: 'Crew Member', access: 'Awaiting verification', icon: User, color: '#A3A3C2', ink: '#111' };

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'back'];

export default function StaffLoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [swingKey, setSwingKey] = useState(0);

  useEffect(() => {
    document.title = 'Staff Portal — FlashPass';
  }, []);

  // Physical keyboard drives the keypad unless the user is typing in a field
  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (/^\d$/.test(e.key)) pressKey(e.key);
      else if (e.key === 'Backspace') pressKey('back');
      else if (e.key === 'Escape') pressKey('clear');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const pressKey = (k) => {
    setError('');
    if (k === 'back') setPin((p) => p.slice(0, -1));
    else if (k === 'clear') setPin('');
    else setPin((p) => (p.length < 6 ? p + k : p));
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!username || pin.length !== 6) {
      setError('Enter username and 6-digit PIN');
      return;
    }

    setLoading(true);
    try {
      const data = await api.staffLogin({ username, pin });
      localStorage.setItem('cc_staff_token', data.token);
      localStorage.setItem('cc_staff_user', JSON.stringify(data.user));

      // Role-based redirect (SRS §5.6.1)
      if (data.user.role === 'SUPER_ADMIN' || data.user.role === 'EVENT_ADMIN') {
        navigate('/admin');
      } else if (data.user.role === 'CASHIER') {
        navigate('/pos');
      } else {
        navigate('/gate');
      }
    } catch (err) {
      setError(err.message || 'Login failed. Please check credentials.');
      setLoading(false);
    }
  };

  const fillDemo = (u, p) => {
    setUsername(u);
    setPin(p);
    setError('');
    setSwingKey((k) => k + 1);
  };

  const role = ROLES.find((r) => r.username === username) || GUEST;
  const RoleIcon = role.icon;
  const accent = role === GUEST ? '#FFD60A' : role.color;

  return (
    <div className="min-h-screen bg-bg flex flex-col overflow-x-hidden">
      <Header />

      <main className="relative flex-1 flex items-center px-4 py-10 overflow-hidden staff-grid">
        {/* Atmosphere: role-tinted glow, vignette, scanning line */}
        <div
          className="pointer-events-none absolute left-[20%] top-1/2 -translate-y-1/2 w-[620px] h-[620px] rounded-full blur-[120px] opacity-25 transition-colors duration-700"
          style={{ background: role.color }}
        />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_45%,#0B0B14_100%)]" />
        <div className="pointer-events-none absolute -top-32 right-0 w-[520px] h-[520px] rounded-full bg-accent/20 blur-[110px]" />
        <div className="pointer-events-none absolute -bottom-40 right-1/4 w-[480px] h-[480px] rounded-full bg-info/15 blur-[110px]" />
        <div className="pointer-events-none staff-scanline absolute inset-x-0 h-24" />

        <div className="relative w-full max-w-5xl mx-auto grid lg:grid-cols-2 gap-12 items-center">
          {/* ===== Lanyard + ID badge ===== */}
          <div className="hidden lg:flex justify-center -mt-10">
            <div key={swingKey} className="staff-badge-swing flex flex-col items-center">
              {/* Strap */}
              <div className="w-8 h-40 -mt-40 relative" style={{ background: `repeating-linear-gradient(180deg, ${role.color} 0 14px, #111 14px 18px)` }}>
                <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 font-mono text-[8px] font-bold tracking-[0.3em] text-black [writing-mode:vertical-rl] opacity-70">FLASHPASS CREW</div>
              </div>
              {/* Clip */}
              <div className="w-12 h-6 rounded-b-lg bg-gradient-to-b from-zinc-300 to-zinc-500 border-2 border-black" />
              <div className="w-3 h-4 bg-zinc-400 border-x-2 border-black" />

              {/* Card */}
              <div
                className="relative w-[300px] rounded-3xl border-[3px] border-black overflow-hidden shadow-[10px_10px_0_#000] transition-colors duration-500"
                style={{ background: '#101020' }}
              >
                <div className="staff-holo absolute inset-0 pointer-events-none" />
                {/* Header band */}
                <div className="relative px-5 pt-4 pb-10 transition-colors duration-500" style={{ background: role.color, color: role.ink }}>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1 font-comic text-xl tracking-wide">
                      <Zap className="w-4 h-4 fill-current" /> FLASHPASS
                    </span>
                    <span className="font-mono text-[9px] font-bold tracking-[0.25em]">CREW ID</span>
                  </div>
                  <div className="mx-auto mt-1 w-12 h-2.5 rounded-full bg-black/80" />
                </div>

                {/* Avatar */}
                <div className="relative -mt-8 flex justify-center">
                  <div
                    className="w-24 h-24 rounded-2xl border-[3px] border-black bg-[#1A1A33] flex items-center justify-center shadow-[4px_4px_0_#000] transition-colors duration-500"
                    style={{ color: role.color }}
                  >
                    <RoleIcon className="w-12 h-12" />
                  </div>
                </div>

                <div className="relative px-6 pt-4 pb-5 text-center">
                  <div className="font-comic text-3xl text-white uppercase tracking-wide leading-none truncate">
                    {username || 'Your name'}
                  </div>
                  <div className="mt-1 font-mono text-xs font-bold uppercase tracking-[0.2em] transition-colors duration-500" style={{ color: role.color }}>
                    {role.title}
                  </div>

                  <div className="mt-4 rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-left">
                    <div className="font-mono text-[9px] uppercase tracking-wider text-text-muted">Access level</div>
                    <div className="font-mono text-xs font-bold text-white">{role.access}</div>
                  </div>

                  {/* PIN progress on the badge */}
                  <div className="mt-3 flex items-center justify-between rounded-xl bg-black/40 border border-white/10 px-3 py-2">
                    <span className="font-mono text-[9px] uppercase tracking-wider text-text-muted">Verification</span>
                    <span className="flex gap-1">
                      {Array.from({ length: 6 }).map((_, i) => (
                        <span
                          key={i}
                          className="w-2.5 h-2.5 rounded-full transition-colors"
                          style={{ background: i < pin.length ? role.color : 'rgba(255,255,255,0.12)' }}
                        />
                      ))}
                    </span>
                  </div>

                  {/* Barcode */}
                  <div className="mt-4 flex h-10 items-stretch justify-center gap-[2px] opacity-90">
                    {'3141592653589793238462'.split('').map((d, i) => (
                      <span key={i} className="bg-white" style={{ width: `${(Number(d) % 3) + 1}px` }} />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ===== Access terminal ===== */}
          <div className="relative w-full max-w-md mx-auto" style={{ '--role': accent }}>
            <div
              className="absolute -inset-3 rounded-[2.5rem] blur-2xl opacity-40 transition-all duration-700"
              style={{ background: `linear-gradient(135deg, ${accent}, #FF2E88 55%, #22D3EE)` }}
            />
            <div
              className="relative rounded-[2rem] p-[2px] shadow-[10px_10px_0_#000] transition-all duration-700"
              style={{ background: `linear-gradient(135deg, ${accent}, #FF2E88 55%, #22D3EE)` }}
            >
            <div className="relative rounded-[calc(2rem-2px)] bg-[#13132A] overflow-hidden p-6 sm:p-8">
              <div
                className="absolute inset-0 pointer-events-none opacity-30 transition-all duration-700"
                style={{ background: `radial-gradient(circle at 0% 0%, ${accent}, transparent 55%), radial-gradient(circle at 100% 100%, #FF2E88, transparent 50%)` }}
              />
              <div className="absolute inset-0 bg-halftone opacity-25 pointer-events-none" />
              <div className="relative">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <div className="flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-success">
                    <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" /> Terminal online
                  </div>
                  <h1 className="font-comic text-4xl text-white uppercase tracking-wide leading-none mt-1">Crew sign-in</h1>
                </div>
                <ShieldCheck className="w-9 h-9 text-white/15" />
              </div>

              {/* Role tabs (demo fill) */}
              <div className="mb-5">
                <div className="mb-2 font-mono text-[10px] font-bold uppercase tracking-wider text-text-muted">Select role · demo login</div>
                <div className="grid grid-cols-4 gap-2">
                  {ROLES.map((r) => {
                    const Icon = r.icon;
                    const active = role === r;
                    return (
                      <button
                        key={r.username}
                        type="button"
                        onClick={() => fillDemo(r.username, r.pin)}
                        title={`${r.title}: ${r.username} / ${r.pin}`}
                        className="flex flex-col items-center gap-1 py-2.5 rounded-xl border-2 transition-all cursor-pointer"
                        style={{
                          borderColor: active ? r.color : 'rgba(255,255,255,0.08)',
                          background: active ? `${r.color}1F` : 'rgba(255,255,255,0.02)',
                          color: active ? r.color : '#A3A3C2'
                        }}
                      >
                        <Icon className="w-5 h-5" />
                        <span className="font-mono text-[9px] font-bold uppercase leading-none">{r.title.split(' ')[0]}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <form onSubmit={handleLogin} className="space-y-4">
                <label className="block">
                  <span className="relative block">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
                    <input
                      type="text"
                      required
                      autoCapitalize="none"
                      autoComplete="username"
                      aria-label="Staff username"
                      placeholder="Staff username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value.toLowerCase())}
                      className="w-full bg-[#1C1C3C] border-2 border-white/15 rounded-2xl pl-11 pr-4 py-3.5 text-base text-text placeholder-text-muted/50 focus:outline-none focus:border-white/30 transition-colors"
                    />
                  </span>
                </label>

                {/* PIN display */}
                <div className="rounded-2xl bg-[#0F0F24] border-2 border-white/15 px-4 py-3 flex items-center justify-between" aria-live="polite">
                  <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-text-muted">PIN</span>
                  <span className="flex gap-2.5">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <span
                        key={i}
                        className={`w-3.5 h-3.5 rounded-full border-2 transition-all ${i < pin.length ? 'scale-110' : ''}`}
                        style={{
                          borderColor: i < pin.length ? role.color : 'rgba(255,255,255,0.2)',
                          background: i < pin.length ? role.color : 'transparent',
                          boxShadow: i < pin.length ? `0 0 10px ${role.color}` : 'none'
                        }}
                      />
                    ))}
                  </span>
                </div>

                {/* Keypad */}
                <div className="grid grid-cols-3 gap-2.5">
                  {KEYS.map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => pressKey(k)}
                      aria-label={k === 'back' ? 'Delete digit' : k === 'clear' ? 'Clear PIN' : k}
                      className={`h-14 rounded-2xl border-2 border-white/15 bg-gradient-to-b from-[#26264E] to-[#1A1A3A] shadow-[0_4px_0_#000] hover:border-[color:var(--role)] hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-[0_1px_0_#000] transition-all flex items-center justify-center cursor-pointer ${
                        /\d/.test(k) ? 'font-comic text-3xl text-white' : 'font-mono text-[10px] font-bold uppercase text-text-muted'
                      }`}
                    >
                      {k === 'back' ? <Delete className="w-5 h-5" /> : k === 'clear' ? 'Clear' : k}
                    </button>
                  ))}
                </div>

                {error && (
                  <div className="bg-danger/15 border-2 border-danger/60 rounded-xl p-3 text-xs text-danger font-mono flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full inline-flex items-center justify-center gap-2 font-comic text-2xl tracking-wider px-5 py-4 rounded-2xl border-2 border-black shadow-[4px_4px_0_#000] hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-[2px_2px_0_#000] transition-all cursor-pointer disabled:opacity-60 disabled:pointer-events-none"
                  style={{ background: role === GUEST ? '#FFD60A' : role.color, color: role === GUEST ? '#111' : role.ink }}
                >
                  {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <KeyRound className="w-5 h-5" />}
                  {loading ? 'VERIFYING…' : 'UNLOCK STATION'}
                </button>
              </form>
              </div>
            </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
