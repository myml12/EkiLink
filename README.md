# 駅3Dネットワーク可視化システム

複数の駅の3Dネットワークを可視化し、経路検索や設備情報の閲覧を可能にするWebアプリケーションです。

## 目次

- [概要](#概要)
- [技術スタック](#技術スタック)
- [主要機能](#主要機能)
- [アーキテクチャ](#アーキテクチャ)
- [データ構造](#データ構造)
- [使用方法](#使用方法)
- [新しい駅の追加方法](#新しい駅の追加方法)
- [ファイル構成](#ファイル構成)
- [実装詳細](#実装詳細)

## 概要

本システムは、階層別屋内地理空間情報データ仕様書に基づいたGeoJSONデータを使用し、駅構内の3Dネットワークを可視化します。MapLibre GL JSとdeck.glを組み合わせることで、3D空間でのネットワーク構造、設備配置、経路探索を実現しています。

### 対応駅

現在、以下の12駅に対応しています：

- 新宿駅 (shinjuku)
- 代々木駅 (yoyogi)
- 赤羽橋駅 (akabanebashi)
- 青山一丁目駅 (aoyama_itchome)
- 麻布十番駅 (azabu_juban)
- 大門駅 (daimon)
- 東新宿駅 (higaashi_shinjuku)
- 国立競技場駅 (kokuritsu_kyogijo)
- 六本木駅 (roppongi)
- 新宿西口駅 (shinjuku_nishiguchi)
- 都庁前駅 (tochomae)
- 上野御徒町駅 (ueno_okachimachi)

## 技術スタック

### コアライブラリ

- **MapLibre GL JS 3.6.2**: 地図表示エンジン
  - 3D地図の表示と操作
  - カメラ制御（回転、ズーム、ピッチ調整）
  - レイヤー管理

- **deck.gl 8.9.33**: 3Dレイヤー描画ライブラリ
  - GeoJsonLayerによる3D空間でのデータ可視化
  - 高パフォーマンスなWebGL描画
  - ピッキング（オブジェクト選択）機能

- **@deck.gl/mapbox 8.9.33**: MapLibre/Mapbox連携ライブラリ
  - deck.glレイヤーをMapLibreマップに統合
  - MapboxLayerによる統合描画

### データ形式

- **GeoJSON**: 地理空間データの標準形式
  - FeatureCollection形式
  - Point, LineString, Polygon, MultiPolygonに対応

### 座標系

- **CRS**: JGD2011 / (B,L) - 世界測地系 緯度経度
- **標高**: 属性値（`ordinal`）として管理し、2次元投影面を積層する構造

## 主要機能

### 1. 3Dネットワーク可視化

#### 1.1 Spaceレイヤー（階層別空間）

- **実装**: MapLibre GL JSの`fill-extrusion`レイヤー
- **表示内容**: 各階層の物理的な空間（通路、階段、コンコースなど）
- **色分け**: 階層ごとに異なる色で表示
- **カテゴリ別色分け**:
  - `B021` (階段): オレンジ (#ff8a65)
  - `B019` (通路): ライトブルー (#4fc3f7)
  - その他: 階層ごとの設定色
- **透明度**: 0.25（半透明表示）
- **高さ**: `offset + SPACE_HEIGHT` (SPACE_HEIGHT = 3.0m)

#### 1.2 ノードレイヤー（結節点）

- **実装**: deck.glの`GeoJsonLayer`
- **表示内容**: ネットワークの結節点（ノード）
- **色分け**: 階層ごとに異なる色
- **サイズ**:
  - `getPointRadius`: 1.0m
  - `radiusMinPixels`: 6px
  - `radiusMaxPixels`: 10px
- **クリック可能**: 経路検索や情報表示に使用
- **Z座標**: `floorOffset + NODE_Z_OFFSET` (NODE_Z_OFFSET = SPACE_HEIGHT + 1.0m)

#### 1.3 リンクレイヤー（経路）

- **実装**: deck.glの`GeoJsonLayer`
- **表示内容**: ノード間の接続（リンク）
- **色**: シアン (#00ffff)
- **線幅**:
  - `lineWidthMinPixels`: 2px
  - `lineWidthMaxPixels`: 4px
- **Z座標**: `floorOffset + LINK_Z_OFFSET` (LINK_Z_OFFSET = SPACE_HEIGHT + 0.5m)

#### 1.4 Space Circleレイヤー（空間情報の視覚化）

- **実装**: deck.glの`GeoJsonLayer`
- **表示内容**: ノードの周囲に円を描画し、空間情報を視覚化
- **半径**: 1.5m
- **色**: Spaceのカテゴリに応じて変化
  - 階段: オレンジ（薄く）
  - 通路: ライトブルー（薄く）
  - その他: 階層色（薄く）

#### 1.5 Facilityレイヤー（設備）

- **実装**: deck.glの`GeoJsonLayer`
- **表示内容**: トイレ、ATM、AEDなどの設備POI
- **色**: シックなグレー（slate-500）
- **サイズ**:
  - `getPointRadius`: 1.0m
  - `radiusMinPixels`: 4px（固定）
- **クリック可能**: 設備情報の表示に使用
- **Z座標**: `floorOffset + SPACE_HEIGHT + 0.5m`

### 2. 経路検索機能

#### 2.1 グラフ構築

- **アルゴリズム**: ノードとリンクデータから無向グラフを構築
- **実装**: `buildRouteGraph()`関数
- **データ構造**: `{nodeId: {neighborId: distance, ...}, ...}`
- **距離計算**: ハーバーサイン公式による2点間の距離（メートル単位）

#### 2.2 最短経路探索

- **アルゴリズム**: ダイクストラ法
- **実装**: `dijkstra()`関数
- **入力**: グラフ、出発ノードID、到着ノードID
- **出力**: ノードIDの配列（経路）

#### 2.3 出発点・到着点の選択

**選択方法**:

1. **ノード直接選択**: ノードをクリックして選択
2. **Facility選択**: 設備をクリックし、最も近いノードを自動選択
3. **Space選択**: Space（空間）をクリックし、そのSpace内のFacilityから最も近いノードを自動選択

**表示**:
- 出発点: 緑色のマーカー
- 到着点: 赤色のマーカー
- **サイズ**:
  - `getPointRadius`: 2.0m
  - `radiusMinPixels`: 8px
  - `radiusMaxPixels`: 12px
- **枠線**: 白色、2-3px

#### 2.4 経路表示

- **実装**: deck.glの`GeoJsonLayer`
- **色**: 赤色 (#ef4444)
- **線幅**:
  - `lineWidthMinPixels`: 5px
  - `lineWidthMaxPixels`: 8px
- **Z座標**: `floorOffset + LINK_Z_OFFSET + 0.2m`（通常のリンクより上に表示）

### 3. 設備管理機能

#### 3.1 設備一覧表示

- **実装**: `showFacilityList()`関数
- **表示内容**:
  - 階層ごとにグループ化
  - カテゴリごとにグループ化
  - 設備名とカテゴリ名を表示
- **ソート**: 階層順（上から下へ）
- **インタラクション**: 設備をクリックすると該当設備にフォーカス

#### 3.2 設備ハイライト

- **実装**: `highlightFacility()`関数
- **表示**: 赤色の円で設備を囲む
- **サイズ**:
  - `getPointRadius`: 3.0m
  - `radiusMinPixels`: 10px（固定）
- **枠線**: 赤色、3px

#### 3.3 設備フォーカス

- **実装**: `focusOnFacility()`関数
- **機能**: 設備をクリックまたは一覧から選択すると、カメラが該当設備に移動
- **高度補正**: カメラのピッチと高さを考慮して、設備が画面中央に表示されるよう座標を補正
- **アニメーション**: `flyTo()`によるスムーズな移動（1.5秒）

### 4. 情報表示機能

#### 4.1 ノード情報表示

- **実装**: MapLibre GL JSの`Popup`
- **表示内容**:
  - ノードID（短縮表示）
  - 階層名
  - 位置（屋内/屋外/境界）
  - 接続リンク数
- **トリガー**: ノードをクリック

#### 4.2 Facility情報表示

- **実装**: MapLibre GL JSの`Popup`
- **表示内容**:
  - 設備種別（カテゴリ名）
  - 設備名称
  - 階層名
  - データ源（フロアマップ/CAD/BIM/3次元地図）
- **トリガー**: 設備をクリック

#### 4.3 Space情報表示

- **実装**: 右下の固定パネル
- **表示内容**:
  - 空間カテゴリ名（通路、階段など）
  - 空間名称
- **表示時間**: 3秒後に自動非表示
- **トリガー**: Space（空間）をクリック

### 5. 駅切り替え機能

- **実装**: `switchStation()`関数
- **機能**:
  - ドロップダウンから駅を選択
  - URLパラメータで直接指定: `index.html?station=shinjuku`
- **処理**:
  - 既存レイヤーの削除
  - 設定ファイル（config.json）の読み込み
  - 駅ごとのロジック設定
  - マップの再初期化

### 6. インタラクティブ機能

#### 6.1 クリック検出

**優先順位**:

1. **ノード**: deck.glの`pickObject()`を使用
   - 3D表示時の視差ズレを回避
   - ピクセル座標から直接オブジェクトを特定
   - 許容誤差: 5px

2. **Facility**: deck.glの`pickObject()`を使用
   - ノードがクリックされていない場合のみ実行

3. **Space**: MapLibre GL JSの`queryRenderedFeatures()`を使用
   - MapLibreレイヤーを対象

#### 6.2 カメラ制御

- **回転**: 右ドラッグ
- **高度変更**: Ctrl + ドラッグ
- **ズーム**: マウスホイール
- **ナビゲーションコントロール**: 右上に配置

## アーキテクチャ

### モジュール構成

```
js/
├── main.js          # メインロジック、初期化、イベントハンドラ
├── map.js           # マップセットアップ、レイヤー描画
├── route.js         # 経路検索機能（グラフ構築、ダイクストラ法）
├── station.js       # 駅管理、駅切り替え
├── facility.js      # 設備管理機能
├── info.js          # 情報表示機能（ポップアップ、パネル）
├── utils.js         # ユーティリティ関数
├── constants.js     # 定数定義
└── stations/        # 駅ごとのカスタマイズロジック
    ├── shinjuku.js
    ├── yoyogi.js
    └── ...
```

### データフロー

1. **初期化** (`main.js`)
   - カテゴリーデータ（categories.json）の読み込み
   - 利用可能な駅リストの取得
   - イベントリスナーの設定

2. **駅選択** (`station.js`)
   - 設定ファイル（config.json）の読み込み
   - 駅ごとのロジック設定
   - マップの初期化または更新

3. **マップセットアップ** (`map.js`)
   - ノード・リンクデータの読み込み
   - Spaceレイヤーの読み込みと描画
   - Facilityレイヤーの読み込みと描画
   - ノードの階層再判定（Spaceレイヤーとの照合）
   - グラフ構築

4. **インタラクション**
   - クリック検出（ノード/Facility/Space）
   - 情報表示または経路検索モードへの切り替え

5. **経路検索** (`route.js`)
   - 出発点・到着点の選択
   - ダイクストラ法による最短経路探索
   - 経路の描画

### 駅ごとのカスタマイズ

各駅は専用のJavaScriptファイル（`js/stations/[駅名].js`）でカスタマイズ可能です。

**実装すべきメソッド**:

- `getSpaceFileName(filePrefix, floorId)`: Spaceファイル名の生成ロジック
- `getFloorName(floor)`: 階層名の表示ロジック
- `getFloorColor(floor)`: 階層ごとの色設定

**例** (新宿駅):

```javascript
const ShinjukuStation = {
    getSpaceFileName: (filePrefix, floorId) => {
        return `${filePrefix}_${floorId}_Space.geojson`;
    },
    getFloorName: (floor) => {
        if (floor === 1) return '1F';
        if (floor === -1) return 'B1F';
        // ...
    },
    getFloorColor: (floor) => {
        if (floor === 1) return [251, 113, 133, 255];
        // ...
    }
};
```

## データ構造

### 設定ファイル (config.json)

各駅のディレクトリに`config.json`を配置します。

```json
{
  "stationName": "新宿駅",
  "center": [139.6991, 35.6882],
  "zoom": 18.5,
  "pitch": 65,
  "bearing": -20,
  "floorOffsets": {
    "1": 60,
    "-1": 45,
    "-2": 30
  },
  "floors": [
    { "id": "1", "offset": 60, "nodeFloor": 1 },
    { "id": "B1", "offset": 45, "nodeFloor": -1 }
  ],
  "floorColors": {
    "1": "#fb7185",
    "B1": "#38bdf8"
  },
  "filePrefix": "Shinjuku",
  "dataFiles": {
    "node": "node.geojson",
    "link": "link.geojson"
  }
}
```

**主要プロパティ**:

- `stationName`: 駅名
- `center`: 初期表示の中心座標 [経度, 緯度]
- `zoom`: 初期ズームレベル
- `pitch`: 初期ピッチ（度）
- `bearing`: 初期方位（度）
- `floorOffsets`: 階層ごとの高さオフセット（メートル）
- `floors`: 階層情報の配列
  - `id`: 階層ID（ファイル名に使用）
  - `offset`: 高さオフセット
  - `nodeFloor`: ノードの階層数値（ordinal）
- `floorColors`: 階層ごとの色（16進数）
- `filePrefix`: ファイル名のプレフィックス
- `dataFiles`: データファイル名

### GeoJSONデータ

#### node.geojson

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": {
        "type": "Point",
        "coordinates": [139.6991, 35.6882]
      },
      "properties": {
        "node_id": "uuid",
        "floor": -1,
        "in_out": 1
      }
    }
  ]
}
```

#### link.geojson

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": {
        "type": "LineString",
        "coordinates": [[139.6991, 35.6882], [139.6992, 35.6883]]
      },
      "properties": {
        "start_id": "node-uuid-1",
        "end_id": "node-uuid-2"
      }
    }
  ]
}
```

#### Space_*.geojson

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": {
        "type": "Polygon",
        "coordinates": [[[139.6991, 35.6882], ...]]
      },
      "properties": {
        "id": "uuid",
        "floor_id": "floor-uuid",
        "category": "B021",
        "name": "階段"
      }
    }
  ]
}
```

#### Facility_*.geojson

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": {
        "type": "Point",
        "coordinates": [139.6991, 35.6882]
      },
      "properties": {
        "id": "uuid",
        "floor_id": "floor-uuid",
        "category": "F001",
        "name": "トイレ",
        "source": "1"
      }
    }
  ]
}
```

### カテゴリーデータ (categories.json)

設備や空間のカテゴリコードと日本語名のマッピング。

```json
{
  "facility": {
    "F001": { "ja": "トイレ" },
    "F027": { "ja": "AED" }
  },
  "space": {
    "B021": { "ja": "階段" },
    "B019": { "ja": "通路" }
  }
}
```

## 使用方法

### 基本的な使い方

1. `index.html`をブラウザで開く
2. 右上のドロップダウンから駅を選択
3. マップ上で以下が可能:
   - ノード、設備、空間をクリックして情報を表示
   - 経路検索パネルから出発点・到着点を選択して経路を検索
   - 設備一覧ボタンから設備一覧を表示

### URLパラメータ

駅を直接指定:

```
index.html?station=shinjuku
```

### マップ操作

- **回転**: 右ドラッグ
- **高度変更**: Ctrl + ドラッグ
- **ズーム**: マウスホイール
- **ナビゲーション**: 右上のコントロール

### 経路検索の手順

1. 「出発点」の「選択」ボタンをクリック
2. マップ上でノード、設備、または空間をクリック
3. 「到着点」の「選択」ボタンをクリック
4. マップ上でノード、設備、または空間をクリック
5. 「経路検索」ボタンをクリック
6. 最短経路が赤色の線で表示されます

## 新しい駅の追加方法

### 1. データディレクトリの作成

```
data/stations/[駅ID]/
├── config.json
├── node.geojson
├── link.geojson
├── [駅名]_Space_[階層ID].geojson
├── [駅名]_Facility_[階層ID].geojson
└── [駅名]_Floor_[階層ID].geojson
```

### 2. 設定ファイルの作成

`config.json`を作成し、駅の設定を記述します。既存の駅（例: `data/stations/shinjuku/config.json`）を参考にしてください。

### 3. 駅ロジックファイルの作成

`js/stations/[駅ID].js`を作成し、駅ごとのカスタマイズロジックを実装します。

```javascript
const [駅名]Station = {
    getSpaceFileName: (filePrefix, floorId) => {
        // ファイル名生成ロジック
    },
    getFloorName: (floor) => {
        // 階層名表示ロジック
    },
    getFloorColor: (floor) => {
        // 階層色設定ロジック
    }
};
```

### 4. 駅リストへの追加

`js/station.js`の`loadAvailableStations()`関数内の`stationsList`に駅IDを追加します。

```javascript
const stationsList = [
    'shinjuku',
    'yoyogi',
    '[新しい駅ID]'  // 追加
];
```

### 5. HTMLへの読み込み追加

`index.html`に駅ロジックファイルのスクリプトタグを追加します。

```html
<script src="./js/stations/[駅ID].js"></script>
```

### 6. 駅切り替えロジックへの追加

`js/station.js`の`switchStation()`関数内のswitch文に駅IDを追加します。

```javascript
case '[駅ID]':
    stationLogic = [駅名]Station;
    break;
```

詳細は `data/stations/README.md` を参照してください。

## ファイル構成

```
gis_challenge/
├── index.html              # メインHTMLファイル
├── README.md               # このファイル
├── specification.md        # データ仕様書
├── css/
│   └── styles.css         # スタイルシート
├── js/
│   ├── main.js            # メインロジック
│   ├── map.js             # マップセットアップ
│   ├── route.js           # 経路検索機能
│   ├── station.js         # 駅管理
│   ├── facility.js        # 設備管理
│   ├── info.js            # 情報表示
│   ├── utils.js           # ユーティリティ
│   ├── constants.js       # 定数定義
│   └── stations/          # 駅ごとのロジック
│       ├── shinjuku.js
│       ├── yoyogi.js
│       └── ...
└── data/
    ├── categories.json     # カテゴリーデータ
    └── stations/           # 駅データ
        ├── shinjuku/
        │   ├── config.json
        │   ├── node.geojson
        │   ├── link.geojson
        │   └── ...
        └── ...
```

## 実装詳細

### ノードの階層再判定

ノードの階層は、Spaceレイヤーとの照合により再判定されます。

1. 各ノードの座標がどのSpaceポリゴン内にあるかを判定（Ray casting algorithm）
2. 複数の階層に含まれる場合は、元の階層に最も近い階層を選択
3. `nodeFloorMap`に記録

### 3D座標変換

2D座標（[経度, 緯度]）を3D座標（[経度, 緯度, 高度]）に変換します。

- **Space**: `[lng, lat, floorOffset]` から `[lng, lat, floorOffset + SPACE_HEIGHT]`
- **ノード**: `[lng, lat, floorOffset + NODE_Z_OFFSET]`
- **リンク**: `[lng, lat, floorOffset + LINK_Z_OFFSET]`
- **Facility**: `[lng, lat, floorOffset + SPACE_HEIGHT + 0.5]`

### クリック検出の最適化

3D表示時の視差ズレを回避するため、deck.glの`pickObject()`を使用します。

- 画面上のピクセル座標から直接オブジェクトを特定
- 経緯度計算を行わないため、視差ズレが発生しない
- 許容誤差（radius）を設定して操作性を向上

### 設備フォーカスの高度補正

設備にフォーカスする際、カメラのピッチと高さを考慮して座標を補正します。

- カメラが地面（Z=0）を見ている時、高さHの物体を中央にするには、視線方向に `H * tan(pitch)` だけ奥の地面を見る必要がある
- この補正により、設備が画面中央に正確に表示される

### グラフ構築の最適化

- 双方向リンクの自動追加
- 距離の事前計算とキャッシュ
- ノード座標の事前マッピング

### レイヤー管理

- レイヤーの動的追加・削除
- 駅切り替え時の完全なクリーンアップ
- 深度テストの適切な設定（常に最前面表示 vs 3D表示）

## ライセンス

（適宜追加）
