# 駅データディレクトリ

このディレクトリには、各駅のデータが格納されています。

## ディレクトリ構造

```
data/stations/
├── shinjuku/          # 新宿駅のデータ
│   ├── config.json    # 駅設定ファイル（必須）
│   ├── node.geojson   # ノードデータ（必須）
│   ├── link.geojson   # リンクデータ（必須）
│   └── [駅名]_[階層]_Space.geojson  # Spaceレイヤーデータ
├── yoyogi/            # 代々木駅のデータ
│   ├── config.json
│   ├── node.geojson
│   ├── link.geojson
│   └── Yoyogi_*_Space.geojson
└── [新しい駅]/        # 新しい駅を追加する場合
    ├── config.json
    ├── node.geojson
    ├── link.geojson
    └── [駅名]_*_Space.geojson
```

## 新しい駅を追加する方法

1. **ディレクトリを作成**
   ```bash
   mkdir data/stations/[駅ID]
   ```
   例: `mkdir data/stations/tokyo`

2. **config.jsonを作成**
   ```json
   {
     "stationName": "駅名",
     "center": [経度, 緯度],
     "zoom": 18.5,
     "pitch": 65,
     "bearing": -20,
     "floorOffsets": {
       "1": 60,
       "-1": 45,
       ...
     },
     "floors": [
       { "id": "1", "offset": 60, "nodeFloor": 1 },
       { "id": "B1", "offset": 45, "nodeFloor": -1 },
       ...
     ],
     "floorColors": {
       "1": "#fb7185",
       "B1": "#38bdf8",
       ...
     },
     "filePrefix": "駅名（ファイル名のプレフィックス）",
     "dataFiles": {
       "node": "node.geojson",
       "link": "link.geojson"
     }
   }
   ```

3. **データファイルを配置**
   - `node.geojson`: ノードデータ
   - `link.geojson`: リンクデータ
   - `[filePrefix]_[階層]_Space.geojson`: Spaceレイヤーデータ
     - 例: `Tokyo_1_Space.geojson`, `Tokyo_B1_Space.geojson`

4. **index.htmlを更新**
   `index.html`の`loadAvailableStations()`関数内の`stationsList`に新しい駅IDを追加:
   ```javascript
   const stationsList = ['shinjuku', 'yoyogi', 'tokyo']; // 新しい駅IDを追加
   ```

## config.jsonの設定項目

- **stationName**: 駅名（表示用）
- **center**: マップの中心座標 [経度, 緯度]
- **zoom**: 初期ズームレベル
- **pitch**: マップの傾き角度
- **bearing**: マップの回転角度
- **floorOffsets**: 各階層の高さオフセット（キーは階層の数値、値は高さ）
- **floors**: Spaceレイヤーの設定配列
  - **id**: 階層ID（ファイル名に使用）
  - **offset**: 高さオフセット
  - **nodeFloor**: ノードのfloorプロパティ値
- **floorColors**: 各階層の色（16進数カラーコード）
- **filePrefix**: ファイル名のプレフィックス
- **dataFiles**: データファイル名の設定

