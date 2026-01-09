// ============================================================================
// 駅3Dネットワーク・スケルトン - メインロジック
// ============================================================================

// Spaceレイヤーの高さ設定（fill-extrusion-height = offset + SPACE_HEIGHT）
const SPACE_HEIGHT = 3.0;

// ノードとリンクのZ座標オフセット（Spaceレイヤーの上に表示）
const NODE_Z_OFFSET = SPACE_HEIGHT + 1.0; // Spaceレイヤーの上1.0の位置
const LINK_Z_OFFSET = SPACE_HEIGHT + 0.5; // Spaceレイヤーの上0.5の位置

// グローバル変数
let map = null;
let config = null;
let nodesData = null;
let nodeFloorMap = {};
let currentPopup = null;
let currentStation = null;
let stationLogic = null; // 駅ごとのロジック

// ============================================================================
// ユーティリティ関数
// ============================================================================

/**
 * 点がポリゴン内にあるかチェック（Ray casting algorithm）
 */
function pointInPolygon(point, polygon) {
    const [x, y] = point;
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const [xi, yi] = polygon[i];
        const [xj, yj] = polygon[j];
        const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

/**
 * ノードクリック検出用の関数
 */
function findNearestNode(lng, lat, tolerance = 0.0001) {
    if (!nodesData) return null;
    let nearestNode = null;
    let minDistance = Infinity;

    nodesData.features.forEach(node => {
        const coords = node.geometry.coordinates;
        const distance = Math.sqrt(
            Math.pow(coords[0] - lng, 2) + Math.pow(coords[1] - lat, 2)
        );
        if (distance < minDistance && distance < tolerance) {
            minDistance = distance;
            nearestNode = node;
        }
    });

    return nearestNode;
}

// ============================================================================
// 駅管理
// ============================================================================

/**
 * 利用可能な駅のリストを取得
 */
async function loadAvailableStations() {
    try {
        // stationsディレクトリ内の各ディレクトリをチェック
        // 新しい駅を追加する場合は、このリストに駅IDを追加してください
        const stationsList = [
            'shinjuku', 'yoyogi', 'akabanebashi', 'aoyama_itchome',
            'azabu_juban', 'daimon', 'higaashi_shinjuku', 'kokuritsu_kyogijo',
            'roppongi', 'shinjuku_nishiguchi', 'tochomae', 'ueno_okachimachi'
        ];
        const select = document.getElementById('station-select');
        select.innerHTML = '';

        for (const stationId of stationsList) {
            try {
                const configResponse = await fetch(`./data/stations/${stationId}/config.json`);
                if (configResponse.ok) {
                    const stationConfig = await configResponse.json();
                    const option = document.createElement('option');
                    option.value = stationId;
                    option.textContent = stationConfig.stationName;
                    select.appendChild(option);
                }
            } catch (e) {
                console.warn(`駅 ${stationId} の設定ファイルが見つかりません:`, e);
            }
        }

        // デフォルトで最初の駅を選択
        if (select.options.length > 0) {
            select.value = select.options[0].value;
        } else {
            select.innerHTML = '<option value="">駅データが見つかりません</option>';
        }
    } catch (e) {
        console.error('駅リストの読み込みに失敗しました:', e);
    }
}

/**
 * 駅を切り替える関数
 */
async function switchStation(stationId) {
    if (!stationId) return;

    currentStation = stationId;

    // 既存のレイヤーとソースを削除
    if (map) {
        // deck.glレイヤー（MapboxLayer）を削除
        ['network-link-layer', 'network-node-layer'].forEach(layerId => {
            try {
                if (map.getLayer(layerId)) {
                    map.removeLayer(layerId);
                }
            } catch (e) {
                console.warn(`[駅切り替え] レイヤー ${layerId} の削除に失敗:`, e);
            }
        });

        // Spaceレイヤーとソースを削除
        const layers = map.getStyle().layers.map(l => l.id);
        layers.forEach(id => {
            if (id !== 'background' && id.startsWith('space-layer-')) {
                try {
                    if (map.getLayer(id)) {
                        map.removeLayer(id);
                    }
                } catch (e) {
                    // エラーは無視（既に削除されている可能性）
                }
            }
        });

        const sources = Object.keys(map.getStyle().sources);
        sources.forEach(id => {
            if (id.startsWith('space-src-')) {
                try {
                    if (map.getSource(id)) {
                        map.removeSource(id);
                    }
                } catch (e) {
                    // エラーは無視（既に削除されている可能性）
                }
            }
        });
    }

    // 設定ファイルを読み込む
    const configResponse = await fetch(`./data/stations/${stationId}/config.json`);
    if (!configResponse.ok) {
        console.error(`駅 ${stationId} の設定ファイルが見つかりません`);
        return;
    }
    config = await configResponse.json();

    // 駅ごとのロジックを設定
    switch (stationId) {
        case 'shinjuku':
            stationLogic = ShinjukuStation;
            break;
        case 'yoyogi':
            stationLogic = YoyogiStation;
            break;
        case 'akabanebashi':
            stationLogic = AkabanebashiStation;
            break;
        case 'aoyama_itchome':
            stationLogic = AoyamaItchomeStation;
            break;
        case 'azabu_juban':
            stationLogic = AzabuJubanStation;
            break;
        case 'daimon':
            stationLogic = DaimonStation;
            break;
        case 'higaashi_shinjuku':
            stationLogic = HigashiShinjukuStation;
            break;
        case 'kokuritsu_kyogijo':
            stationLogic = KokuritsuKyogijoStation;
            break;
        case 'roppongi':
            stationLogic = RoppongiStation;
            break;
        case 'shinjuku_nishiguchi':
            stationLogic = ShinjukuNishiguchiStation;
            break;
        case 'tochomae':
            stationLogic = TochomaeStation;
            break;
        case 'ueno_okachimachi':
            stationLogic = UenoOkachimachiStation;
            break;
        default:
            // デフォルトは新宿駅のロジックを使用（後方互換性）
            stationLogic = ShinjukuStation;
            console.warn(`駅 ${stationId} の専用ロジックが見つかりません。新宿駅のロジックを使用します。`);
    }

    if (!stationLogic) {
        console.error(`[駅切り替え] stationLogicの設定に失敗しました: ${stationId}`);
        return;
    }

    // タイトルを更新
    document.getElementById('station-name').textContent = `${config.stationName} 3Dスケルトン`;
    document.title = `${config.stationName} 3Dネットワーク・スケルトン`;

    // マップを再初期化
    if (map) {
        // 既存のマップがある場合、設定を更新してセットアップを実行
        map.setCenter(config.center);
        map.setZoom(config.zoom);
        map.setPitch(config.pitch);
        map.setBearing(config.bearing);
        await setupMap();
    } else {
        // 新規にマップを作成
        map = new maplibregl.Map({
            container: 'map',
            style: {
                version: 8,
                sources: {},
                layers: [{
                    id: 'background',
                    type: 'background',
                    paint: { 'background-color': '#0b0f1a' }
                }]
            },
            center: config.center,
            zoom: config.zoom,
            pitch: config.pitch,
            bearing: config.bearing,
            antialias: true
        });

        map.addControl(new maplibregl.NavigationControl(), 'top-right');

        // マップのイベントリスナーを設定
        map.on('click', (e) => {
            // ノードのクリック検出は無効化し、空間情報のみ表示
            const features = map.queryRenderedFeatures(e.point, {
                layers: config.floors.map(f => `space-layer-${f.id}`)
            });
            if (features.length > 0) {
                const f = features[0];
                const props = f.properties;

                // categoryコードの意味を取得（specification.md参照）
                const getCategoryName = (category) => {
                    const categoryMap = {
                        'B001': '商業施設',
                        'B002': '事務所',
                        'B007': 'トイレ（男性）',
                        'B008': 'トイレ（女性）',
                        'B009': 'トイレ（共用）',
                        'B011': '多機能トイレ',
                        'B012': '多機能トイレ',
                        'B013': '多機能トイレ',
                        'B014': '多機能トイレ',
                        'B019': '通路',
                        'B021': '階段の範囲',
                        'B022': 'エレベーターの範囲',
                        'B023': 'エスカレーターの範囲',
                        'B029': '通路/コンコース',
                        'B999': '屋外'
                    };
                    return categoryMap[category] || category;
                };

                let html = '<div class="space-popup">';
                html += '<h3>空間情報</h3>';

                if (props.category) {
                    html += '<div class="info-row">';
                    html += '<span class="info-label">種別:</span>';
                    html += `<span class="info-value">${getCategoryName(props.category)}</span>`;
                    html += '</div>';
                    // コードも表示
                    html += '<div class="info-row">';
                    html += '<span class="info-label">コード:</span>';
                    html += `<span class="info-value" style="font-size: 0.8em; opacity: 0.7;">${props.category}</span>`;
                    html += '</div>';
                }

                // 名称は空白でない場合のみ表示
                if (props.name && props.name.trim() !== '') {
                    html += '<div class="info-row">';
                    html += '<span class="info-label">名称:</span>';
                    html += `<span class="info-value">${props.name.trim()}</span>`;
                    html += '</div>';
                }

                // その他の属性情報（specification.md参照）
                if (props.restricted !== undefined) {
                    const restrictedText = props.restricted === '1' ? '制限あり' : '制限なし';
                    html += '<div class="info-row">';
                    html += '<span class="info-label">進入制限:</span>';
                    html += `<span class="info-value">${restrictedText}</span>`;
                    html += '</div>';
                }

                if (props.toll !== undefined) {
                    const tollText = props.toll === '1' ? '不明' : props.toll === '2' ? '有料' : '無料';
                    html += '<div class="info-row">';
                    html += '<span class="info-label">有料区分:</span>';
                    html += `<span class="info-value">${tollText}</span>`;
                    html += '</div>';
                }

                html += '</div>';
                new maplibregl.Popup({
                    closeButton: true,
                    className: 'space-info-popup'
                })
                    .setLngLat(e.lngLat)
                    .setHTML(html)
                    .addTo(map);
            }
        });

        // 新規マップの場合はloadイベントを待つ
        map.on('load', () => setupMap());
    }
}

// ============================================================================
// マップセットアップ
// ============================================================================

/**
 * マップのセットアップ
 * ノード描画ロジックの説明:
 * 1. node.geojson: ノード（節点）の位置情報（2D座標 + 階層情報）
 * 2. link.geojson: ノード間の接続情報（リンク/経路）
 * 3. Space_*.geojson: 各階層の空間情報（ポリゴン） - ノードの階層判定に使用
 */
async function setupMap() {
    // stationLogicが設定されているか確認
    if (!stationLogic) {
        console.error(`[${config.stationName}] setupMap: stationLogicが設定されていません`);
        return;
    }

    const dataDir = `./data/stations/${currentStation}/`;

    // ノードとリンクデータを読み込む
    const [nodes, linksData] = await Promise.all([
        fetch(`${dataDir}${config.dataFiles.node}`).then(res => res.json()),
        fetch(`${dataDir}${config.dataFiles.link}`).then(res => res.json())
    ]);

    nodesData = nodes;
    nodeFloorMap = {};

    // 一時的にノードのfloorプロパティを使用（後でSpaceレイヤーで再判定）
    nodesData.features.forEach(f => {
        nodeFloorMap[f.properties.node_id] = f.properties.floor;
    });

    // Spaceレイヤーを読み込んでから、ノードの実際の階層を再判定
    // 駅ごとのロジックを使用してファイル名を取得
    // Spaceレイヤー: 各階層の空間（通路、階段など）を表すポリゴンデータ
    // ノードがどのSpaceレイヤー（階層）に含まれるかで、ノードの実際の階層を判定
    if (!stationLogic) {
        console.error(`[${config.stationName}] stationLogicが設定されていません`);
        return;
    }

    const spaceLayerPromises = config.floors.map(async f => {
        // 駅ごとのロジックでファイル名を取得（命名規則が駅によって異なる）
        const fileName = stationLogic.getSpaceFileName(config.filePrefix, f.id);
        const fullPath = `${dataDir}${fileName}`;

        let data = null;
        try {
            const response = await fetch(fullPath);
            if (response.ok && response.status === 200) {
                data = await response.json();
                if (!data || data.type !== 'FeatureCollection') {
                    console.warn(`[${config.stationName}] 無効なGeoJSON形式: 階層=${f.id}`);
                    return null;
                }
            } else {
                console.warn(`[${config.stationName}] Spaceレイヤーファイルが見つかりません: 階層=${f.id}, ファイル=${fileName}`);
                return null;
            }
        } catch (e) {
            console.error(`[${config.stationName}] Spaceレイヤーファイルの読み込みエラー: 階層=${f.id}`, e);
            return null;
        }

        map.addSource(`space-src-${f.id}`, { type: 'geojson', data: data });
        map.addLayer({
            id: `space-layer-${f.id}`,
            type: 'fill-extrusion',
            source: `space-src-${f.id}`,
            paint: {
                'fill-extrusion-color': [
                    'match', ['get', 'category'],
                    'B021', '#ff8a65', // 階段
                    'B019', '#4fc3f7', // 通路
                    config.floorColors[f.id]
                ],
                'fill-extrusion-base': f.offset,
                'fill-extrusion-height': f.offset + SPACE_HEIGHT,
                'fill-extrusion-opacity': 0.25
            }
        });
        return { id: f.id, data: data, nodeFloor: f.nodeFloor };
    });

    const spaceLayers = (await Promise.all(spaceLayerPromises)).filter(layer => layer !== null);

    // ノードの実際の階層を再判定し、どのSpaceに属するかも記録
    // 各ノードの座標がどのSpaceレイヤー（階層）のポリゴン内にあるかを判定
    // 複数の階層に含まれる場合は、元の階層に最も近い階層を選択
    const nodeSpaceMap = {}; // ノードID -> Space情報（色など）
    nodesData.features.forEach(node => {
        const coords = node.geometry.coordinates; // ノードの2D座標 [lng, lat]
        const originalFloor = node.properties.floor; // ノードの元の階層情報
        let actualFloor = null;
        let matchedLayers = [];
        let matchedSpace = null; // マッチしたSpaceの情報

        // 各Spaceレイヤー（階層）をチェック
        for (const layer of spaceLayers) {
            for (const feature of layer.data.features) {
                const polyCoords = feature.geometry.coordinates;
                let rings = [];

                // PolygonまたはMultiPolygonからリング（外側の輪郭）を取得
                if (feature.geometry.type === 'Polygon') {
                    rings = [polyCoords[0]]; // 最初のリングが外側
                } else if (feature.geometry.type === 'MultiPolygon') {
                    rings = polyCoords.map(poly => poly[0]); // 各ポリゴンの最初のリング
                }

                // ノードがポリゴン内にあるかチェック（Ray casting algorithm）
                for (const ring of rings) {
                    if (pointInPolygon(coords, ring)) {
                        matchedLayers.push(layer.nodeFloor);
                        // Space情報を記録（最初にマッチしたSpaceを使用）
                        if (!matchedSpace) {
                            matchedSpace = {
                                category: feature.properties.category,
                                name: feature.properties.name,
                                floor: layer.nodeFloor,
                                floorId: layer.id
                            };
                        }
                        break;
                    }
                }
            }
        }

        // 複数の階層にマッチした場合、元の階層に最も近い階層を選択
        if (matchedLayers.length > 0) {
            actualFloor = matchedLayers.reduce((prev, curr) => {
                const prevDiff = Math.abs(prev - originalFloor);
                const currDiff = Math.abs(curr - originalFloor);
                return currDiff < prevDiff ? curr : prev;
            });
        } else {
            // マッチしなかった場合は元の階層を使用
            actualFloor = originalFloor;
        }

        nodeFloorMap[node.properties.node_id] = actualFloor;
        nodeSpaceMap[node.properties.node_id] = matchedSpace;
    });

    // ネットワーク描画
    const MapboxLayer = deck.MapboxLayer || window.MapboxLayer;

    // リンク(経路)の描画
    // link.geojsonのデータを使用してノード間の接続を表示
    const linkLayer = new MapboxLayer({
        id: 'network-link-layer',
        type: deck.GeoJsonLayer,
        data: linksData, // link.geojsonのデータ
        pickable: false,
        lineWidthMinPixels: 2,
        lineWidthMaxPixels: 4,
        getLineColor: [0, 255, 255, 255], // シアン（明るい青緑）
        parameters: {
            depthTest: false, // 深度テストを無効化（常に最前面に表示）
            blend: true,
            blendFunc: [770, 771, 1, 771]
        },
        dataTransform: (data) => {
            data.features.forEach(f => {
                if (f.geometry.type === 'LineString') {
                    const startFloor = nodeFloorMap[f.properties.start_id];
                    const endFloor = nodeFloorMap[f.properties.end_id];
                    const startZ = config.floorOffsets[String(startFloor)] ?? 0;
                    const endZ = config.floorOffsets[String(endFloor)] ?? 0;
                    const coords = f.geometry.coordinates;
                    f.geometry.coordinates = [
                        [coords[0][0], coords[0][1], startZ + LINK_Z_OFFSET],
                        [coords[1][0], coords[1][1], endZ + LINK_Z_OFFSET]
                    ];
                }
            });
            return data;
        }
    });

    // ノード(節点)の描画
    // deck.glのGeoJsonLayerを使用して3D空間にノードを描画
    // node.geojsonのデータを使用してノード（結節点）を表示
    const NODE_RADIUS = 1;
    const nodeLayer = new MapboxLayer({
        id: 'network-node-layer',
        type: deck.GeoJsonLayer,
        data: nodesData, // node.geojsonのデータ（235個のノード）
        pickable: false, // クリック不可
        getPointRadius: NODE_RADIUS,
        radiusMinPixels: 3,
        radiusMaxPixels: 6,
        getFillColor: (d) => {
            // 階層ごとに色を変える（nodeFloorMapで更新された階層を使用）
            // 駅ごとのロジックを使用して色を取得
            const floor = nodeFloorMap[d.properties.node_id] ?? d.properties.floor;
            return stationLogic.getFloorColor(floor);
        },
        stroked: false,
        parameters: {
            depthTest: true, // 深度テストを有効化（3D表示）
            depthFunc: 519, // GL_LEQUAL
            blend: true,
            blendFunc: [770, 771, 1, 771] // GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA
        },
        dataTransform: (data) => {
            // ノードの座標を3Dに変換
            // 元の2D座標 [lng, lat] を [lng, lat, z] に変換
            // z座標 = 階層の高さオフセット + NODE_Z_OFFSET（Spaceレイヤーの上に表示）
            data.features.forEach(f => {
                const floor = nodeFloorMap[f.properties.node_id] ?? f.properties.floor;
                const z = config.floorOffsets[String(floor)]; // 階層の高さオフセット
                if (z === undefined) {
                    console.warn(`[${config.stationName}] ノード ${f.properties.node_id} の階層 ${floor} に対応するfloorOffsetsが見つかりません`);
                }
                const finalZ = z ?? 0;
                const coords = f.geometry.coordinates; // 元の座標 [lng, lat] または [lng, lat, z]
                // 3D座標に変換（元の座標の最初の2要素を使用）
                f.geometry.coordinates = [coords[0], coords[1], finalZ + NODE_Z_OFFSET];
            });
            return data;
        }
    });

    // ノードの周りに円を描画（空間情報を視覚化）
    // Spaceレイヤー内にあるノードのみ円で囲む
    const SPACE_CIRCLE_RADIUS = 1.5; // 円の半径（メートル単位、小さく）
    const spaceCircleData = nodesData.features
        .filter(f => nodeSpaceMap[f.properties.node_id] !== null && nodeSpaceMap[f.properties.node_id] !== undefined)
        .map(f => {
            const floor = nodeFloorMap[f.properties.node_id] ?? f.properties.floor;
            const z = config.floorOffsets[String(floor)] ?? 0;
            const coords = f.geometry.coordinates;
            const spaceInfo = nodeSpaceMap[f.properties.node_id];

            // Spaceの色を決定（より控えめに）
            let circleColor = [56, 189, 248, 80]; // デフォルト: スカイブルー（薄く）
            if (spaceInfo) {
                if (spaceInfo.category === 'B021') {
                    circleColor = [255, 138, 101, 80]; // 階段: オレンジ（薄く）
                } else if (spaceInfo.category === 'B019') {
                    circleColor = [79, 195, 247, 80]; // 通路: ライトブルー（薄く）
                } else {
                    // 階層の色を使用（薄く）
                    const floorColor = stationLogic.getFloorColor(spaceInfo.floor);
                    circleColor = [floorColor[0], floorColor[1], floorColor[2], 80];
                }
            }

            return {
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [coords[0], coords[1], z + NODE_Z_OFFSET]
                },
                properties: {
                    node_id: f.properties.node_id,
                    color: circleColor
                }
            };
        });

    const spaceCircleLayer = new MapboxLayer({
        id: 'space-circle-layer',
        type: deck.GeoJsonLayer,
        data: {
            type: 'FeatureCollection',
            features: spaceCircleData
        },
        pickable: false,
        getPointRadius: SPACE_CIRCLE_RADIUS,
        radiusMinPixels: 4,
        radiusMaxPixels: 8,
        getFillColor: [0, 0, 0, 0], // 塗りつぶしなし（透明）
        stroked: true,
        getLineColor: (d) => d.properties.color,
        lineWidthMinPixels: 0.5,
        lineWidthMaxPixels: 1,
        parameters: {
            depthTest: true,
            depthFunc: 519,
            blend: true,
            blendFunc: [770, 771, 1, 771]
        }
    });

    map.addLayer(linkLayer);
    map.addLayer(nodeLayer);
    map.addLayer(spaceCircleLayer);
}

// ============================================================================
// ノード情報表示
// ============================================================================

/**
 * ノード情報を表示する関数
 * @param {Object} feature - ノードのGeoJSON feature
 * @param {Array<number>} lngLat - [経度, 緯度] の配列（ノードの実際の座標）
 */
function showNodeInfo(feature, lngLat) {
    if (currentPopup) {
        currentPopup.remove();
    }

    const props = feature.properties;
    const floor = nodeFloorMap[props.node_id] ?? props.floor;
    // 駅ごとのロジックを使用して階層名を取得
    const floorName = stationLogic.getFloorName(floor);

    // リンク情報を表示
    const links = [];
    for (let i = 1; i <= 8; i++) {
        const linkId = props[`link${i}_id`];
        if (linkId && linkId.trim() !== '') {
            links.push(linkId.substring(0, 8) + '...');
        }
    }

    let html = '<div class="node-popup">';
    html += '<h3>ノード情報</h3>';
    if (props.node_id) {
        html += '<div class="info-row">';
        html += '<span class="info-label">ノードID:</span>';
        html += `<span class="info-value">${props.node_id.substring(0, 8)}...</span>`;
        html += '</div>';
    }
    html += '<div class="info-row">';
    html += '<span class="info-label">階層:</span>';
    html += `<span class="info-value">${floorName}</span>`;
    html += '</div>';
    if (props.in_out !== undefined) {
        const inOutText = props.in_out === 1 ? '屋内' :
            props.in_out === 2 ? '屋外' :
                props.in_out === 3 ? '境界' : '不明';
        html += '<div class="info-row">';
        html += '<span class="info-label">位置:</span>';
        html += `<span class="info-value">${inOutText}</span>`;
        html += '</div>';
    }

    // リンク情報を表示
    if (links.length > 0) {
        html += '<div class="info-row">';
        html += '<span class="info-label">接続:</span>';
        html += `<span class="info-value">${links.length}件</span>`;
        html += '</div>';
    }

    html += '</div>';

    currentPopup = new maplibregl.Popup({
        closeButton: true,
        closeOnClick: true,
        className: 'node-info-popup',
        offset: [0, -10] // ノードの上に表示
    })
        .setLngLat(lngLat)
        .setHTML(html)
        .addTo(map);
}

// ============================================================================
// 初期化
// ============================================================================

// DOMContentLoadedイベントを待ってから初期化
document.addEventListener('DOMContentLoaded', async () => {
    // イベントリスナー
    document.getElementById('station-select').addEventListener('change', (e) => {
        switchStation(e.target.value);
    });

    // 利用可能な駅を読み込む
    await loadAvailableStations();

    // URLパラメータから駅を取得
    const urlParams = new URLSearchParams(window.location.search);
    const stationParam = urlParams.get('station');
    const select = document.getElementById('station-select');

    if (stationParam && Array.from(select.options).some(opt => opt.value === stationParam)) {
        select.value = stationParam;
    } else if (select.options.length > 0) {
        select.value = select.options[0].value;
    }

    // 初期駅を読み込む
    if (select.value) {
        await switchStation(select.value);
    }
});

