# 運用メモ

## 初期設定

1. GitHub Secretsに `RAKUTEN_APPLICATION_ID`、`RAKUTEN_ACCESS_KEY`、`RAKUTEN_AFFILIATE_ID` を登録します。
2. GitHub PagesのSourceを `GitHub Actions` にします。
3. `Update Rakuten Travel data` を手動実行して、実データ取得を確認します。

公開URLはワークフローで `https://choritomo.github.io/rakuten-travel2` に固定しています。古い `PUBLIC_SITE_URL` 変数が残っていても現在のActionsでは使いません。

## 毎日の自動更新

`.github/workflows/update-rakuten-travel.yml` が毎日 07:10 JST に動きます。

- 楽天トラベル空室検索APIから候補を取得
- GitHub Pages URLを `Referer` ヘッダーとして送信
- 複数の日付・条件で再試行
- 0件エリアは楽天トラベル施設検索APIで補完
- `data/hotels.json` を更新
- `drafts/latest-onsen.md` を生成
- `themes/*.html` を生成
- 変更があれば自動コミット
- 同じジョブ内でGitHub Pagesへ公開

取得ロジックや生成処理を変更したときも `push` で自動更新が走ります。生成されたデータだけのコミットでは再実行しないようにしています。

## 0件表示になったとき

1. Actions の `Update Rakuten Travel data` を開き、最新ログを確認します。
2. `Updated 0 records` ではなく、`fallback` または `stale` と出ていれば空白回避は動いています。
3. `REQUEST_CONTEXT_BODY_HTTP_REFERRER_MISSING` が出た場合は、楽天Web Service側のアプリ設定で公開URLが許可されているか確認します。
4. Secrets の値が空でないか確認します。
5. 日程が大型連休・満室期の場合は、エリアや日付を追加して再実行します。

## 公開前チェック

- PR/広告表記が残っている
- 料金・空室は変動する旨が書かれている
- 楽天アフィリエイトID入りURLになっている
- 0件時もページが空白にならず、要確認表示が出る
- Search Consoleを登録して表示回数を見る
