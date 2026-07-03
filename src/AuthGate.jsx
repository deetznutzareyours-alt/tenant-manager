import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient.js';

export default function AuthGate({ children }) {
  const [session, setSession] = useState(undefined); // undefined = still checking
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup'
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => listener.subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');
    setBusy(true);
    if (mode === 'signin') {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
    } else {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) setError(error.message);
      else setNotice('账号已创建。如果 Supabase 项目开启了邮箱验证，先去邮箱点确认链接，再回来登录。');
    }
    setBusy(false);
  };

  const inputStyle = {
    width: '100%', padding: '12px 14px', borderRadius: 12, border: '1px solid #ddd',
    marginBottom: 10, fontSize: 15, boxSizing: 'border-box', outline: 'none',
  };

  if (session === undefined) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f7' }}>
        <div style={{ width: 32, height: 32, border: '2px solid #4f46e5', borderTopColor: 'transparent', borderRadius: '50%', animation: 'tm-spin 0.8s linear infinite' }} />
        <style>{'@keyframes tm-spin { to { transform: rotate(360deg); } }'}</style>
      </div>
    );
  }

  if (!session) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f7', padding: 20, fontFamily: '-apple-system, system-ui, sans-serif' }}>
        <form onSubmit={handleSubmit} style={{ width: '100%', maxWidth: 360, background: '#fff', borderRadius: 20, padding: 28, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>租户管理</h1>
          <p style={{ fontSize: 13, color: '#888', marginBottom: 20 }}>{mode === 'signin' ? '登录以同步你的数据' : '创建账号'}</p>
          <input type="email" required placeholder="邮箱" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} />
          <input type="password" required placeholder="密码（至少6位）" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} style={{ ...inputStyle, marginBottom: 14 }} />
          {error && <p style={{ color: '#e11d48', fontSize: 12, marginBottom: 10 }}>{error}</p>}
          {notice && <p style={{ color: '#0891b2', fontSize: 12, marginBottom: 10 }}>{notice}</p>}
          <button type="submit" disabled={busy} style={{ width: '100%', padding: '12px', borderRadius: 12, border: 'none', background: '#4f46e5', color: '#fff', fontWeight: 600, fontSize: 15, marginBottom: 12 }}>
            {busy ? '处理中…' : mode === 'signin' ? '登录' : '注册'}
          </button>
          <p style={{ textAlign: 'center', fontSize: 13, color: '#4f46e5', cursor: 'pointer', margin: 0 }}
            onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(''); setNotice(''); }}>
            {mode === 'signin' ? '没有账号？注册' : '已有账号？登录'}
          </p>
        </form>
      </div>
    );
  }

  return children;
}
