# 駅3Dネットワーク可視化システム

複数の駅の3Dネットワークを可視化するWebアプリケーションです。

## ディレクトリ構造

```
gis_challange/
├── index.html              # メインアプリケーション（共通）
├── data/
│   └── stations/          # 駅データディレクトリ
│       ├── shinjuku/      # 新宿駅のデータ
│       ├── yoyogi/        # 代々木駅のデータ
│       └── [新しい駅]/    # 新しい駅を追加する場合
└── specification.md       # データ仕様書
```

## 使用方法

1. `index.html`をブラウザで開く
2. 右上のドロップダウンから駅を選択
3. URLパラメータで直接指定: `index.html?station=shinjuku`

## 新しい駅を追加する方法

詳細は `data/stations/README.md` を参照してください。

### 簡単な手順

1. `data/stations/` ディレクトリに新しい駅のディレクトリを作成
2. `config.json` を作成（既存の駅を参考に）
3. データファイル（`node.geojson`, `link.geojson`, Spaceファイル）を配置
4. `index.html` の `loadAvailableStations()` 関数内の `stationsList` に駅IDを追加

## 技術スタック

- MapLibre GL JS: 地図表示
- deck.gl: 3Dレイヤー描画
- GeoJSON: データ形式

## ライセンス

（適宜追加）

