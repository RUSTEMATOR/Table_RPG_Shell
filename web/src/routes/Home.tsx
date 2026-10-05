import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { homeFor, useMe } from '../lib/me.tsx';

export function Home() {
  const { me, loading } = useMe();
  const navigate = useNavigate();
  useEffect(() => {
    if (loading) return;
    navigate(me ? homeFor(me.member.role) : '/login', { replace: true });
  }, [loading, me, navigate]);
  return <div className="screen center muted">Загрузка…</div>;
}
