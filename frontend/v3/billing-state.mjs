const TERMINAL_STATUSES = new Set(["canceled", "incomplete_expired"]);

function formatUntil(subscription) {
  if (!subscription?.access_until) return "日時を確認中";
  const value = new Date(subscription.access_until);
  return Number.isNaN(value.getTime()) ? "日時を確認中" : value.toLocaleString();
}

function priceLabel(subscription) {
  return subscription?.currency === "usd" ? "月額 US$4.50" : "月額400円";
}

export function billingMessage(billing) {
  if (!billing?.configured) return "有料プランの申し込みは現在準備中です。";
  const subscription = billing.subscription;
  const until = formatUntil(subscription);
  switch (billing.access_state) {
    case "active":
      return `有料プラン（${priceLabel(subscription)}）を利用中です。現在の利用期限は${until}です。`;
    case "active_canceling":
      return `解約予約済みです。${until}までは有料機能を利用でき、その後は無料版に切り替わります。`;
    case "payment_required":
      return "お支払いを確認できないため、有料機能を一時停止しています。契約・支払い方法を管理し、完了後に状態を再確認してください。";
    case "paused":
      return "契約が一時停止中のため、有料機能を利用できません。契約管理画面で状態を確認してください。";
    case "processing":
      return "契約手続きを確認中です。少し待ってから状態を再確認してください。解決しない場合は契約管理画面を確認してください。";
    case "expired":
      return "有料版の利用期間が終了しています。現在は無料版を利用できます。";
    case "canceled":
      return "契約は終了しています。現在は無料版を利用できます。";
    case "unknown":
      return "契約状態を確認できないため、有料機能を停止しています。契約管理画面で確認してください。";
    default:
      return "現在は無料会員です。";
  }
}

export function canShowCheckoutPlan(billing) {
  const subscription = billing?.subscription;
  return !subscription || TERMINAL_STATUSES.has(subscription.status);
}

export function canStartCheckout(billing) {
  return Boolean(billing?.configured && billing?.checkout_enabled && billing?.checkout_available);
}
