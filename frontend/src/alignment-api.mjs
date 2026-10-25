const configured = typeof __APP_API_BASE_URL__ === 'undefined' ? '' : String(__APP_API_BASE_URL__ || '').trim();
export async function alignmentRequest(path, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 75000);
  try {
    const response = await fetch(`${configured.replace(/\/$/, '')}${path}`, {
      method: body ? 'POST' : 'GET', signal: controller.signal,
      ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(typeof data?.detail === 'string' ? data.detail : '入力内容または計算APIの接続を確認してください。');
    if (!data) throw new Error('計算APIから正しい応答がありません。接続先を確認してください。');
    return data;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('通信がタイムアウトしました。入力は残っています。もう一度お試しください。');
    if (error instanceof TypeError) throw new Error('サーバーに接続できません。入力は残っています。もう一度お試しください。');
    throw error;
  } finally { clearTimeout(timer); }
}
