# 運用メモ

## 初期設定

1. GitHub Secretsに `RAKUTEN_APPLICATION_ID`、`RAKUTEN_ACCESS_KEY`、`RAKUTEN_AFFILIATE_ID` を登録します。
2. GitHub PagesのSourceを `GitHub Actions` にします。
3. 公開URLが決まったら Actions Variables に `PUBLIC_SITE_URL` を登録します。
4. `Update Rakuten Travel data` を手動実行して、実データ取得を確認します。

## 毎日の自動更新

`.github/workflows/update-rakuten-travel.yml` が毎日 07:10 JST に動きます。

- 楽天トラベル空室検索APIから候補を取得
- `data/hotels.json` を更新
- `drafts/latest-onsen.md` を生成
- `themes/*.html` を生成
- 変更があれば自動コミット

## 公開前チェック

- PR/広告表記が残っている
- 料金・空室は変動する旨が書かれている
- 楽天アフィリエイトID入りURLになっている
- Search Consoleを登録して表示回数を見る
