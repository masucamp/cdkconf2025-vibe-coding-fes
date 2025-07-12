# Timestream & Neptune Analytics Platform

AWS Well-Architected Framework準拠のTimestreamとNeptuneを組み合わせた分析プラットフォームです。

## 🏗️ アーキテクチャ

このプラットフォームは以下のコンポーネントで構成されています：

- **Amazon Timestream**: 時系列データストレージ
- **Amazon Neptune**: グラフデータベース
- **Amazon Kinesis**: リアルタイムデータストリーミング
- **AWS Lambda**: データ処理・API
- **Amazon API Gateway**: RESTful API
- **Amazon S3**: データアーカイブ
- **Amazon VPC**: セキュアなネットワーク環境

## 🚀 クイックスタート

### 前提条件

- Node.js 18+ 
- AWS CLI設定済み
- Python 3.8+ (テストデータ送信用)

### デプロイ

```bash
# 依存関係のインストール
npm install

# 自動デプロイ（推奨）
./scripts/deploy.sh
```

または手動デプロイ：

```bash
# ビルド・構文チェック
npm run build
npx cdk synth

# デプロイ
npx cdk deploy
```

## 🧪 テスト

### テストデータの送信

```bash
# Kinesisにサンプルデータを送信
python3 scripts/send_test_data.py --stream-name <KINESIS_STREAM_NAME> --count 10
```

### APIクエリテスト

```bash
# メトリクスクエリ
curl "<API_GATEWAY_URL>/query?type=metrics"
```

## 📊 Well-Architected Framework 準拠

### セキュリティ
- ✅ KMS暗号化（保存時・転送時）
- ✅ VPC・セキュリティグループによるネットワーク分離
- ✅ IAM最小権限の原則
- ✅ CDK Nagによるセキュリティチェック

### 信頼性
- ✅ マルチAZ構成
- ✅ 自動バックアップ（Neptune 7日間）
- ✅ エラーハンドリング・リトライ機能

### パフォーマンス効率性
- ✅ Kinesisによるリアルタイム処理
- ✅ Timestream階層ストレージ
- ✅ 適切なリソースサイジング

### コスト最適化
- ✅ S3ライフサイクルポリシー
- ✅ Timestream保持期間最適化
- ✅ コスト効率的なインスタンスタイプ

### 運用上の優秀性
- ✅ CloudWatch監視・アラーム
- ✅ 構造化ログ出力
- ✅ 自動化されたデプロイメント

## 📁 プロジェクト構造

```
├── lib/
│   └── timestream-neptune-stack.ts    # メインCDKスタック
├── bin/
│   └── cdkconf2025-vibe-coding-fes.ts # CDKアプリエントリーポイント
├── scripts/
│   ├── deploy.sh                      # 自動デプロイスクリプト
│   └── send_test_data.py             # テストデータ送信
├── ARCHITECTURE.md                    # 詳細アーキテクチャドキュメント
└── README.md                         # このファイル
```

## 🔧 主要コマンド

```bash
# TypeScriptコンパイル
npm run build

# ファイル変更監視
npm run watch

# テスト実行
npm run test

# CDK合成（CloudFormationテンプレート生成）
npx cdk synth

# デプロイ
npx cdk deploy

# スタック削除
npx cdk destroy
```

## 💰 コスト見積もり

月額概算（us-east-1リージョン）：
- Neptune: $200-300
- Timestream: $50-100
- Lambda: $10-20
- Kinesis: $15-30
- その他: $20-50

**合計**: 約 $295-500/月

詳細は `ARCHITECTURE.md` を参照してください。

## 📚 ドキュメント

- [ARCHITECTURE.md](./ARCHITECTURE.md) - 詳細アーキテクチャ説明
- [AWS Well-Architected Framework](https://aws.amazon.com/architecture/well-architected/)
- [CDK Developer Guide](https://docs.aws.amazon.com/cdk/v2/guide/)

## 🛠️ トラブルシューティング

### よくある問題

1. **デプロイエラー**: AWS認証情報を確認
2. **Neptune接続エラー**: VPC・セキュリティグループ設定確認
3. **Lambda タイムアウト**: VPC設定・NAT Gateway確認

詳細は `ARCHITECTURE.md` のトラブルシューティングセクションを参照。

## 🤝 コントリビューション

1. フォークしてブランチ作成
2. 変更を実装
3. CDK Nagチェック通過確認
4. プルリクエスト作成

## 📄 ライセンス

MIT License
