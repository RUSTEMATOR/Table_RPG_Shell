import { useRouteError } from 'react-router';

/**
 * Экран сбоя вместо стандартного «Hey developer» роутера. Чаще всего это устаревший кусок приложения в кэше браузера
 * после обновления — поэтому главная кнопка перезагружает страницу.
 */
export function RouteError() {
  const err = useRouteError();
  const text = err instanceof Error ? err.message : typeof err === 'string' ? err : '';
  return (
    <div className="screen center min-h-dvh">
      <div className="card grid max-w-[440px] gap-3">
        <h1 className="m-0">Что-то сломалось</h1>
        <p className="m-0 text-muted">Обычно помогает перезагрузить страницу: после обновления в браузере мог остаться старый кусок приложения.</p>
        {text && <pre className="prewrap m-0 rounded-control bg-surface-2 p-3 font-mono text-[13px]">{text}</pre>}
        <button type="button" className="btn" onClick={() => location.reload()}>
          Перезагрузить
        </button>
      </div>
    </div>
  );
}
