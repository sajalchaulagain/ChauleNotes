import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, LockKeyhole, Mail, UserRound } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import BrandLogo from '../../components/common/BrandLogo';
import { toast } from 'react-hot-toast';

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleRegister = async (event) => {
    event.preventDefault(); setLoading(true); setError('');
    const { error: authError } = await register(email, password, username);
    if (authError) { setError(authError.message); toast.error(authError.message); }
    else { toast.success('Account created. Welcome to ChauleNotes!'); navigate('/'); }
    setLoading(false);
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-indigo-50 via-white to-violet-100 px-4 py-10">
      <div className="pointer-events-none absolute -left-24 top-10 h-72 w-72 rounded-full bg-indigo-300/30 blur-3xl" />
      <div className="pointer-events-none absolute -right-20 bottom-0 h-80 w-80 rounded-full bg-violet-300/30 blur-3xl" />
      <section className="relative w-full max-w-md rounded-3xl border border-white/80 bg-white/75 p-8 shadow-2xl shadow-indigo-900/10 backdrop-blur-xl sm:p-10">
        <BrandLogo />
        <h1 className="mt-9 text-2xl font-bold text-slate-900">Create your account</h1>
        <p className="mt-2 text-sm text-slate-500">A calm place for every thought.</p>
        {error && <div role="alert" className="mt-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
        <form onSubmit={handleRegister} className="mt-7 space-y-5">
          <label className="block text-sm font-medium text-slate-700">Your name
            <span className="relative mt-2 block"><UserRound className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18}/><input type="text" autoComplete="name" required maxLength={80} value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Sajal Chaulagain" className="w-full rounded-xl border border-slate-200 bg-white/80 py-3 pl-11 pr-4 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100" /></span>
          </label>
          <label className="block text-sm font-medium text-slate-700">Email address
            <span className="relative mt-2 block"><Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18}/><input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="w-full rounded-xl border border-slate-200 bg-white/80 py-3 pl-11 pr-4 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100" /></span>
          </label>
          <label className="block text-sm font-medium text-slate-700">Password
            <span className="relative mt-2 block"><LockKeyhole className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18}/><input type={showPassword ? 'text' : 'password'} autoComplete="new-password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" className="w-full rounded-xl border border-slate-200 bg-white/80 py-3 pl-11 pr-12 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100" /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700">{showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}</button></span>
          </label>
          <p className="text-xs leading-5 text-slate-500">Your password is handled securely by Firebase Authentication. ChauleNotes never stores it.</p>
          <button disabled={loading} className="w-full rounded-xl bg-indigo-600 py-3 font-semibold text-white shadow-lg shadow-indigo-600/20 transition hover:bg-indigo-700 disabled:opacity-60">{loading ? 'Creating account…' : 'Create account'}</button>
        </form>
        <p className="mt-7 text-center text-sm text-slate-500">Already have an account? <Link to="/login" className="font-semibold text-indigo-600 hover:text-indigo-800">Sign in</Link></p>
      </section>
    </main>
  );
}
