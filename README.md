# Timestream & Neptune Analytics Platform

AWS Well-Architected Framework準拠のTimestreamとNeptuneを組み合わせた分析プラットフォームです。
保守性とスケーラビリティを重視したモジュラー設計で構築されています。

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

### 環境別デプロイ

```bash
# 依存関係のインストール
npm install

# 開発環境デプロイ（デフォルト）
./scripts/deploy.sh

# ステージング環境デプロイ
./scripts/deploy.sh staging

# 本番環境デプロイ（CDK Nag有効）
./scripts/deploy.sh production true
```

### 手動デプロイ

```bash
# ビルド・構文チェック
npm run build

# 環境指定でsynth
npx cdk synth --context environment=development

# デプロイ
npx cdk deploy --context environment=production
```

## 🧪 テスト

### 単体テスト実行

```bash
npm test
```

### テストデータの送信

```bash
# Kinesisにサンプルデータを送信
python3 scripts/send_test_data.py --stream-name <KINESIS_STREAM_NAME> --count 10
```

### APIクエリテスト

```bash
# ヘルスチェック
curl "<API_GATEWAY_URL>/query?type=health"

# メトリクスクエリ
curl "<API_GATEWAY_URL>/query?type=metrics"

# 集約クエリ
curl "<API_GATEWAY_URL>/query?type=aggregated&hours=24"
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
- ✅ 環境別リソースサイジング

### 運用上の優秀性
- ✅ CloudWatch監視・アラーム・ダッシュボード
- ✅ 構造化ログ出力
- ✅ 自動化されたデプロイメント

## 📁 プロジェクト構造

```
├── lib/
│   ├── config/
│   │   └── stack-config.ts              # 環境別設定管理
│   ├── constructs/
│   │   ├── networking-construct.ts      # VPC・ネットワーキング
│   │   ├── data-storage-construct.ts    # Timestream・Neptune・S3
│   │   ├── data-processing-construct.ts # Kinesis・Lambda処理
│   │   ├── api-gateway-construct.ts     # API Gateway・クエリLambda
│   │   └── monitoring-construct.ts      # CloudWatch・アラーム
│   ├── lambda/
│   │   ├── data-processor/              # データ処理Lambda
│   │   └── query-function/              # クエリLambda
│   ├── utils/
│   │   └── nag-suppressions.ts         # CDK Nag抑制管理
│   └── timestream-neptune-stack.ts     # メインスタック
├── bin/
│   └── cdkconf2025-vibe-coding-fes.ts  # CDKアプリエントリーポイント
├── scripts/
│   ├── deploy.sh                        # 環境別デプロイスクリプト
│   └── send_test_data.py               # テストデータ送信
├── test/
│   └── timestream-neptune-stack.test.ts # 包括的テストスイート
├── generated-diagrams/                  # アーキテクチャ図
├── ARCHITECTURE.md                      # 詳細アーキテクチャドキュメント
└── README.md                           # このファイル
```

## 🔧 主要コマンド

```bash
# TypeScriptコンパイル
npm run build

# ファイル変更監視
npm run watch

# テスト実行
npm run test

# 環境別CDK合成
npx cdk synth --context environment=development
npx cdk synth --context environment=production

# 環境別デプロイ
npx cdk deploy --context environment=staging

# スタック削除
npx cdk destroy --context environment=development
```

## 🌍 環境管理

### 開発環境 (development)
- コスト最適化: 小さなインスタンス、少ないシャード数
- CDK Nag: デフォルト無効（高速開発）
- リソース: t3.small Neptune、1 Kinesis シャード

### ステージング環境 (staging)
- 本番類似構成: 中程度のリソース
- CDK Nag: 有効
- バックアップ: 3日間保持

### 本番環境 (production)
- 高可用性: 大きなインスタンス、複数シャード
- CDK Nag: 必須
- リソース: r5.large Neptune、4 Kinesis シャード

## 💰 コスト見積もり

### 開発環境
- Neptune: $100-150/月
- その他: $50-80/月
- **合計**: 約 $150-230/月

### 本番環境
- Neptune: $400-600/月
- その他: $100-150/月
- **合計**: 約 $500-750/月

詳細は `ARCHITECTURE.md` を参照してください。

## 🧪 テスト戦略

### 単体テスト
- 各コンストラクトの独立テスト
- 環境別設定の検証
- CloudFormationテンプレートの検証

### 統合テスト
- API エンドポイントテスト
- データフローテスト
- 監視・アラームテスト

## 📚 ドキュメント

- [ARCHITECTURE.md](./ARCHITECTURE.md) - 詳細アーキテクチャ説明
- [AWS Well-Architected Framework](https://aws.amazon.com/architecture/well-architected/)
- [CDK Developer Guide](https://docs.aws.amazon.com/cdk/v2/guide/)

## 🛠️ トラブルシューティング

### よくある問題

1. **デプロイエラー**: AWS認証情報を確認
2. **Neptune接続エラー**: VPC・セキュリティグループ設定確認
3. **Lambda タイムアウト**: VPC設定・NAT Gateway確認
4. **環境設定エラー**: `--context environment=<env>` の指定確認

詳細は `ARCHITECTURE.md` のトラブルシューティングセクションを参照。

## 🔄 アーキテクチャの特徴

### 保守性の向上
- ✅ モジュラー設計: 機能別コンストラクト分離
- ✅ 設定外部化: 環境別設定ファイル
- ✅ コード分離: Lambda関数の外部ファイル化
- ✅ 型安全性: TypeScript型定義の強化

### スケーラビリティの向上
- ✅ 環境別リソースサイジング
- ✅ 設定駆動デプロイメント
- ✅ 再利用可能コンポーネント

### 運用性の向上
- ✅ 包括的テストスイート
- ✅ CDK Nag抑制の一元管理
- ✅ 環境別デプロイメント戦略

## 🤝 コントリビューション

1. フォークしてブランチ作成
2. 変更を実装
3. テスト実行: `npm test`
4. CDK Nagチェック通過確認
5. プルリクエスト作成

## 📄 ライセンス

MIT License
