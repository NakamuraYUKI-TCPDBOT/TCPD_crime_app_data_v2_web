# TurtleCity S2 警察用 罰金計算アプリ - Cloudflare Workers版

## GitHub + Cloudflare Workers で公開

このリポジトリは Cloudflare Workers Static Assets 用に構成済みです。

### GitHub
1. GitHubで新しいリポジトリを作成します（例: `turtlecity-fine`）。
2. このフォルダの中身をリポジトリ直下へアップロードします。
3. `main` ブランチへコミットします。

### Cloudflare
1. Cloudflare Dashboard → Workers & Pages → Create application を開きます。
2. Import a repository を選択します。
3. GitHubを接続し、上で作ったリポジトリを選択します。
4. Worker name は `turtlecity-fine` にします。
5. Deploy command は `npx wrangler deploy` のままで構いません。
6. Save and Deploy します。

公開後は `turtlecity-fine.<account-subdomain>.workers.dev` のようなURLでアクセスできます。

### 更新
`public/` 内のWebアプリを修正してGitHubの `main` にpushすると、Cloudflareが自動で再デプロイします。

### 独自ドメイン
Cloudflare側の Worker → Settings / Domains & Routes から Custom Domain を追加します。
例: `fine.example.jp`

## ファイル構成
- `public/` 実際に公開されるWebアプリ
- `wrangler.jsonc` Cloudflare Workers設定
- `package.json` Wranglerの実行設定


## Android PWA 修正
- モバイルでは sticky + backdrop-filter を無効化
- モバイルカードの box-shadow を無効化
- タッチ端末ではボタンtransitionを無効化
- Service Workerキャッシュをv4へ更新し、data JSONのクエリ別キャッシュ増殖を防止
- Worker名を tcpd-crime-app-data-v2-web に統一

更新後、Androidで既にインストール済みの場合は、一度アプリを完全終了して再起動してください。
旧キャッシュが残る場合はアプリをアンインストール→Chromeでサイトを開く→再インストールが確実です。
