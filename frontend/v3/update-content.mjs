export const updateHistory = [
  {
    date: "2026-10-04",
    title: "天体イベントから3Dマップを開けるようになりました",
    body: "日別の天体イベントカレンダーから、イベント日時の3Dマップへ移動し、出生図とのアスペクトを確認できます。AIチャットにはイベントの案内と質問候補が表示され、候補を選んで質問できます。",
  },
  {
    date: "2026-10-04",
    title: "Google連携を追加しました",
    body: "Googleアカウントでログイン・新規登録できるようになりました。天体イベントの詳細から、選んだイベントをGoogleカレンダーへ追加できます（Google側で確認・保存）。",
  },
  {
    date: "2026-10-01",
    title: "AIチャット機能を追加しました",
    body: "3Dマップの「AIに聞く」から、使い方の確認や表示中のチャートについて質問できるようになりました。",
  },
];

export const announcements = [];
export const updateReadEvent = "v3:update-content-read";
const storageKey = section => `celestial:v3:update-read:${section}`;

// Content, not the application build, determines whether an item is new.
export function hasUnreadContent(section, entries, storage) {
  if (!entries.length) return false;
  try {
    const read = JSON.parse(storage?.getItem(storageKey(section)) || "[]");
    return entries.some(entry => !Array.isArray(read) || !read.includes(JSON.stringify(entry)));
  } catch {
    return true;
  }
}

export function markContentRead(section, entries, storage) {
  try {
    storage?.setItem(storageKey(section), JSON.stringify(entries.map(entry => JSON.stringify(entry))));
  } catch {
    // A blocked/full browser store must not prevent opening the menu.
  }
}
