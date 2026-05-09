# rakuten-travel2

楽天トラベルAPIを使って、直前予約・温泉・子連れ・駅近などの切り口で宿候補を自動更新する静的サイトMVPです。

公開サイト: https://choritomo.github.io/rakuten-travel2/

## ローカル確認

```powershell
npm run dev
```

`http://localhost:4173` を開きます。

## GitHub Secrets

`Settings > Secrets and variables > Actions` に登録します。

Secrets:

- `RAKUTEN_APPLICATION_ID`
- `RAKUTEN_ACCESS_KEY`
- `RAKUTEN_AFFILIATE_ID`

公開URLはワークフロー内で `https://choritomo.github.io/rakuten-travel2` に固定しています。`PUBLIC_SITE_URL` 変数が古い値で残っていても、現在のActionsでは使いません。

## 自動化

- `Update Rakuten Travel data`: 楽天APIからデータを更新し、固定ページを生成し、そのままGitHub Pagesへ公開します。
- `Deploy static site to GitHub Pages`: UIやドキュメント変更をGitHub Pagesへ公開します。

データ更新は毎日 07:10 JST に動きます。さらに、取得ロジックを変更したときは `push` でも動くようにしてあります。

## 0件対策

空室検索は日付や条件が少し厳しいだけで0件になりやすいので、現在は以下の順で取得します。

1. 複数の直近日・週末日程で空室検索
2. 温泉などは条件付き検索と条件を緩めた検索を両方実行
3. それでも0件のエリアは施設検索候補で補完
4. 全体が0件なら、空白ページではなく「要確認」の検索導線を表示

このサイトは楽天公式サイトではありません。PR/広告表記と、料金・空室が変動する旨の表示を残してください。
