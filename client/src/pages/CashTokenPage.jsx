import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../services/api';
import { initSocket, joinRoom } from '../services/socket';
import ComicButton from '../components/common/ComicButton';
import ComicCard from '../components/common/ComicCard';
import Header from '../components/common/Header';
import { ArrowLeft, Clock, ShieldAlert, Sparkles, CheckCircle2 } from 'lucide-react';

export default function CashTokenPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState('FORM'); // 'FORM' or 'TOKEN'
  const [formData, setFormData] = useState({ name: '', phone: '' });
  const [tokenData, setTokenData] = useState(null);
  const [timeLeft, setTimeLeft] = useState(1800); // 30 minutes in seconds
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    document.title = 'Cash Token Pass — FlashPass';
  }, []);

  // Keep screen awake using Wake Lock API
  useEffect(() => {
    let wakeLock = null;
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLock = await navigator.wakeLock.request('screen');
        }
      } catch (err) {}
    };

    if (step === 'TOKEN') {
      requestWakeLock();
    }

    return () => {
      if (wakeLock) wakeLock.release();
    };
  }, [step]);

  // WebSocket listener for live token payment
  useEffect(() => {
    if (!tokenData) return;

    const socket = initSocket();
    joinRoom(`token:${tokenData.token._id}`);

    const handleStatus = (data) => {
      if (data.status === 'PAID') {
        navigate(`/pass/${data.pass.orderId}`);
      }
    };

    socket.on('token:status', handleStatus);

    // Polling fallback every 3 seconds
    const interval = setInterval(async () => {
      try {
        const res = await api.getCashToken(tokenData.token._id);
        if (res.token.status === 'PAID' && res.pass) {
          clearInterval(interval);
          navigate(`/pass/${res.pass.orderId}`);
        }
      } catch (e) {}
    }, 3000);

    return () => {
      clearInterval(interval);
      socket.off('token:status', handleStatus);
    };
  }, [tokenData, navigate]);

  // Countdown timer
  useEffect(() => {
    if (step !== 'TOKEN' || timeLeft <= 0) return;
    const timer = setInterval(() => {
      setTimeLeft(prev => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [step, timeLeft]);

  const handleCreateToken = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.phone || formData.phone.length !== 10) {
      alert('Please enter your full name and 10-digit mobile number.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.createCashToken(formData);
      if (res.existingPass) {
        navigate(`/pass/${res.orderId}`);
        return;
      }
      setTokenData(res);
      setStep('TOKEN');
    } catch (err) {
      alert(err.message || 'Could not generate cash token');
    } finally {
      setSubmitting(false);
    }
  };

  const formatCountdown = (secs) => {
    const mins = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(mins).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-bg flex flex-col justify-between">
      <Header />

      <main className="max-w-md mx-auto w-full px-4 py-6 flex-1 flex flex-col justify-center">
        {step === 'FORM' ? (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="p-2 rounded-lg bg-surface-2 border border-border text-text hover:text-primary transition-all"
                title="Back to previous page"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <h2 className="font-comic text-2xl text-warning tracking-wide">
                VENUE CASH TOKEN
              </h2>
            </div>

            <ComicCard color="yellow" className="bg-halftone">
              <p className="text-xs text-text-muted font-mono mb-4">
                Standing in the ticket line? Generate a cash token on your phone, then show the code to the cashier!
              </p>

              <form onSubmit={handleCreateToken} className="space-y-4">
                <div>
                  <label className="block text-xs font-mono uppercase text-text-muted mb-1 font-bold">
                    Full Name
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Sourav Halder"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full bg-surface-2 border-2 border-border rounded-xl px-3.5 py-2.5 text-text placeholder-text-muted/50 focus:outline-none focus:border-warning text-base"
                  />
                </div>

                <div>
                  <label className="block text-xs font-mono uppercase text-text-muted mb-1 font-bold">
                    Mobile Number (+91)
                  </label>
                  <input
                    type="tel"
                    required
                    maxLength={10}
                    placeholder="98765 43210"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value.replace(/\D/g, '') })}
                    className="w-full bg-surface-2 border-2 border-border rounded-xl px-3.5 py-2.5 text-text font-mono placeholder-text-muted/50 focus:outline-none focus:border-warning text-base tracking-wider"
                  />
                </div>

                <ComicButton
                  type="submit"
                  variant="primary"
                  size="lg"
                  disabled={submitting}
                  className="w-full"
                >
                  {submitting ? 'GENERATING...' : 'GENERATE CASH TOKEN'}
                </ComicButton>
              </form>
            </ComicCard>
          </div>
        ) : (
          /* High-Contrast Token Card (Readable from 1.5 meters in noisy hall) */
          <div className="text-center">
            <div className="flex justify-start mb-3">
              <button
                type="button"
                onClick={() => setStep('FORM')}
                className="p-2 rounded-xl bg-surface-2 border border-border text-text hover:text-primary transition-all flex items-center gap-1.5 text-xs font-mono font-bold shadow-[2px_2px_0_#000]"
                title="Go back to token form"
              >
                <ArrowLeft className="w-4 h-4 text-primary" />
                <span>Back</span>
              </button>
            </div>

            <div className="bg-primary border-4 border-black rounded-3xl p-6 shadow-[6px_6px_0_#000] text-black mb-4">
              <span className="font-mono text-xs uppercase font-extrabold tracking-widest block mb-2 opacity-80">
                SHOW THIS AT THE CASH DESK
              </span>

              {/* Huge 96px Token Number */}
              <div className="font-comic text-7xl sm:text-8xl tracking-wider leading-none py-2 my-2 border-y-2 border-black/30">
                {tokenData?.token?.display || 'C-142'}
              </div>

              <div className="font-mono text-base font-bold uppercase mb-1">
                PAY ₹{tokenData?.amountRupees || '52.00'} IN CASH
              </div>
              <div className="font-mono text-xs opacity-75">
                Check Code: <strong>{tokenData?.token?.checkCode}</strong> • {tokenData?.token?.holderName}
              </div>

              {/* Countdown */}
              <div className="mt-4 pt-3 border-t-2 border-black/20 flex items-center justify-center gap-1.5 font-mono text-xs font-bold">
                <Clock className="w-4 h-4" />
                <span>Expires in: {formatCountdown(timeLeft)}</span>
              </div>
            </div>

            <div className="bg-surface-2 border border-border rounded-2xl p-4 text-xs font-mono text-text-muted flex items-center justify-center gap-2">
              <Sparkles className="w-4 h-4 text-primary animate-spin" />
              <span>Your phone will automatically turn into the pass the moment you pay!</span>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

