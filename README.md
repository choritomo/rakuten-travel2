# rakuten-travel2

楽天トラベルAPIを使って、直前予約・温泉・子連れ・駅近などの切り口で宿候補を自動更新する静的サイトMVPです。

## ローカル確認

```powershell
npm run dev
```

`http://localhost:4173` を開きます。

## GitHub Secrets

`Settings > Secrets and variables > Actions` に登録します。

- `RAKUTEN_APPLICATION_ID`
- `RAKUTEN_ACCESS_KEY`
- `RAKUTEN_AFFILIATE_ID`

公開URLが決まったら Variables にも追加します。

- `PUBLIC_SITE_URL`

## 自動化

- `Update Rakuten Travel data`: 楽天APIからデータを更新し、固定ページを生成します。
- `Deploy static site to GitHub Pages`: GitHub Pagesへ公開します。

このサイトは楽天公式サイトではありません。PR/広告表記と、料金・空室が変動する旨の表示を残してください。
