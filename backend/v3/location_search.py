"""V3-only normalization of Japanese prefecture values from the birth form."""

JAPANESE_PREFECTURES = dict(zip(
    "Hokkaido Aomori Iwate Miyagi Akita Yamagata Fukushima Ibaraki Tochigi Gunma "
    "Saitama Chiba Tokyo Kanagawa Niigata Toyama Ishikawa Fukui Yamanashi Nagano "
    "Gifu Shizuoka Aichi Mie Shiga Kyoto Osaka Hyogo Nara Wakayama Tottori "
    "Shimane Okayama Hiroshima Yamaguchi Tokushima Kagawa Ehime Kochi Fukuoka "
    "Saga Nagasaki Kumamoto Oita Miyazaki Kagoshima Okinawa".lower().split(),
    "北海道 青森県 岩手県 宮城県 秋田県 山形県 福島県 茨城県 栃木県 群馬県 "
    "埼玉県 千葉県 東京都 神奈川県 新潟県 富山県 石川県 福井県 山梨県 長野県 "
    "岐阜県 静岡県 愛知県 三重県 滋賀県 京都府 大阪府 兵庫県 奈良県 和歌山県 鳥取県 "
    "島根県 岡山県 広島県 山口県 徳島県 香川県 愛媛県 高知県 福岡県 "
    "佐賀県 長崎県 熊本県 大分県 宮崎県 鹿児島県 沖縄県".split(),
))


def normalize_prefecture(prefecture: str | None, country_code: str) -> str | None:
    if country_code.upper() != "JP" or not prefecture:
        return prefecture
    value = prefecture.strip()
    return JAPANESE_PREFECTURES.get(value.casefold(), value)
