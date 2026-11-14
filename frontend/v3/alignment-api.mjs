import { apiUrl } from './api-origin.mjs';

export async function alignmentRequest(path, body) {
  if (!path.startsWith('/api/alignment/') || path.includes('..') || path.includes('?') || path.includes('#')) throw new Error('Invalid alignment API path');
  const endpoint=apiUrl(path.replace('/api/alignment/','/api/v3/alignment/'));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 75000);
  try {
    const response = await fetch(endpoint, {
      method: body ? 'POST' : 'GET', signal: controller.signal,
      ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const detail = data?.detail;
      if (typeof detail === 'string') throw new Error(detail);
      if (response.status === 422) {
        const birthError = Array.isArray(detail) && detail.find(issue =>
          ['alignment_birth_date', 'alignment_birth_time'].includes(issue?.type) &&
          typeof issue.msg === 'string');
        throw new Error(birthError?.msg || (path === '/api/alignment/chart'
          ? '生年月日・出生時刻・出生地を確認してください。'
          : '入力内容を確認してください。'));
      }
      throw new Error('計算サーバーでエラーが発生しました。時間をおいてもう一度お試しください。');
    }
    if (!data) throw new Error('計算結果を受け取れませんでした。時間をおいてもう一度お試しください。');
    return data;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('通信がタイムアウトしました。入力は残っています。もう一度お試しください。');
    if (error instanceof TypeError) throw new Error('サーバーに接続できません。入力は残っています。もう一度お試しください。');
    throw error;
  } finally { clearTimeout(timer); }
}
