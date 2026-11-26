'use client';

import { useState } from 'react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { POINTS_CONFIG } from '@/lib/points-config';

interface AuthModalProps {
  open: boolean;
  initialMode?: 'login' | 'register';
  supabaseConfigured: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function AuthModal({
  open,
  initialMode = 'login',
  supabaseConfigured,
  onClose,
  onSuccess,
}: AuthModalProps) {
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'error' | 'info'; text: string } | null>(null);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setMessage({ type: 'error', text: 'Supabase 환경변수가 설정되지 않았습니다. 현재는 체험 모드로 이용 가능합니다.' });
      return;
    }

    setLoading(true);
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) {
          setMessage({ type: 'error', text: '이메일 또는 비밀번호를 확인해 주세요.' });
          return;
        }
        onSuccess();
        onClose();
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
        });
        if (error) {
          setMessage({ type: 'error', text: error.message || '회원가입에 실패했어요.' });
          return;
        }
        if (data.session) {
          onSuccess();
          onClose();
        } else {
          setMessage({ type: 'info', text: '인증 메일을 보냈어요. 메일함에서 인증을 완료한 뒤 로그인해 주세요.' });
        }
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="auth-modal-title" onClick={onClose}>
      <div className="auth-modal" onClick={(e) => e.stopPropagation()}>
        <div className="auth-modal-header">
          <h2 id="auth-modal-title">{mode === 'login' ? '등기로 로그인' : '등기로 시작하기'}</h2>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="닫기">×</button>
        </div>

        <p className="auth-modal-desc">
          {mode === 'login'
            ? '로그인하면 공유한 등기 PDF와 관리 물건, 포인트가 안전하게 저장됩니다.'
            : `가입하면 웰컴 포인트 +${POINTS_CONFIG.welcomeBonus}${POINTS_CONFIG.unit}를 바로 드려요.`}
        </p>

        {!supabaseConfigured && (
          <div className="alert-box alert-warning">
            Supabase 키가 설정되지 않아 지금은 브라우저 체험 모드로 동작합니다. 로그인 없이 모든 화면을 테스트할 수 있어요.
          </div>
        )}

        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="field">
            <span>이메일</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com"
              autoComplete="email"
            />
          </label>
          <label className="field">
            <span>비밀번호</span>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="6자 이상 입력"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </label>

          {message && (
            <div className={`alert-box ${message.type === 'error' ? 'alert-danger' : 'alert-info'}`}>
              {message.text}
            </div>
          )}

          <button type="submit" className="btn btn-primary btn-block" disabled={loading || !supabaseConfigured}>
            {loading ? '처리 중...' : mode === 'login' ? '로그인' : '회원가입'}
          </button>
        </form>

        <div className="auth-modal-footer">
          {mode === 'login' ? (
            <button type="button" className="link-btn" onClick={() => { setMode('register'); setMessage(null); }}>
              처음이신가요? 회원가입하기
            </button>
          ) : (
            <button type="button" className="link-btn" onClick={() => { setMode('login'); setMessage(null); }}>
              이미 계정이 있으신가요? 로그인하기
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
