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
let linksData = null;
let facilitiesData = {}; // 階層ごとのFacilityデータ
let floorsData = {}; // 階層ごとのFloorデータ（階層名取得用）
let nodeFloorMap = {};
let currentPopup = null;
let currentStation = null;
let stationLogic = null; // 駅ごとのロジック

// 経路検索関連
let routeGraph = null; // グラフ構造 {nodeId: {neighborId: distance, ...}, ...}
let routeStartNode = null; // 出発点のノードID
let routeEndNode = null; // 到着点のノードID
let routePath = null; // 検索された経路（ノードIDの配列）
let routeSelectionMode = null; // 'start' | 'end' | null
let routeLayer = null; // 経路表示レイヤー
let selectedNodesLayer = null; // 選択されたノード表示レイヤー

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
        // 元の2D座標を使用（_originalCoordsがあればそれを使用、なければgeometry.coordinatesの最初の2要素）
        const coords = node.properties._originalCoords ||
            (node.geometry.coordinates.length >= 2 ?
                [node.geometry.coordinates[0], node.geometry.coordinates[1]] :
                node.geometry.coordinates);
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

/**
 * Facilityから最も近いNodeを見つける
 */
function findNearestNodeToFacility(facilityLng, facilityLat, tolerance = 0.001) {
    if (!nodesData) return null;
    let nearestNode = null;
    let minDistance = Infinity;

    nodesData.features.forEach(node => {
        const coords = node.geometry.coordinates;
        const distance = Math.sqrt(
            Math.pow(coords[0] - facilityLng, 2) + Math.pow(coords[1] - facilityLat, 2)
        );
        if (distance < minDistance && distance < tolerance) {
            minDistance = distance;
            nearestNode = node;
        }
    });

    return nearestNode;
}

/**
 * 2点間の距離を計算（メートル単位の概算）
 */
function calculateDistance(lng1, lat1, lng2, lat2) {
    const R = 6371000; // 地球の半径（メートル）
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

/**
 * グラフ構造を構築（NodeとLinkから）
 */
function buildRouteGraph() {
    if (!nodesData || !linksData) {
        console.warn('グラフ構築: nodesDataまたはlinksDataがありません');
        return {};
    }

    const graph = {};
    const nodeCoords = {}; // nodeId -> [lng, lat]

    // ノードの座標を記録
    nodesData.features.forEach(node => {
        const nodeId = node.properties.node_id;
        const coords = node.geometry.coordinates;
        nodeCoords[nodeId] = [coords[0], coords[1]];
        graph[nodeId] = {};
    });

    // リンクからグラフを構築
    linksData.features.forEach(link => {
        const startId = link.properties.start_id;
        const endId = link.properties.end_id;

        if (nodeCoords[startId] && nodeCoords[endId]) {
            const distance = calculateDistance(
                nodeCoords[startId][0], nodeCoords[startId][1],
                nodeCoords[endId][0], nodeCoords[endId][1]
            );

            // 双方向のリンクを追加
            if (!graph[startId][endId] || graph[startId][endId] > distance) {
                graph[startId][endId] = distance;
            }
            if (!graph[endId][startId] || graph[endId][startId] > distance) {
                graph[endId][startId] = distance;
            }
        }
    });

    return graph;
}

/**
 * ダイクストラ法による最短経路探索
 */
function dijkstra(graph, startId, endId) {
    if (!graph[startId] || !graph[endId]) {
        return null; // 開始点または終了点がグラフに存在しない
    }

    const distances = {};
    const previous = {};
    const unvisited = new Set();
    const visited = new Set();

    // 初期化
    for (const nodeId in graph) {
        distances[nodeId] = Infinity;
        previous[nodeId] = null;
        unvisited.add(nodeId);
    }
    distances[startId] = 0;

    while (unvisited.size > 0) {
        // 未訪問ノードの中で距離が最小のものを選択
        let currentId = null;
        let minDistance = Infinity;
        for (const nodeId of unvisited) {
            if (distances[nodeId] < minDistance) {
                minDistance = distances[nodeId];
                currentId = nodeId;
            }
        }

        if (currentId === null || minDistance === Infinity) {
            break; // 到達不可能
        }

        if (currentId === endId) {
            // 終了点に到達
            const path = [];
            let node = endId;
            while (node !== null) {
                path.unshift(node);
                node = previous[node];
            }
            return path;
        }

        unvisited.delete(currentId);
        visited.add(currentId);

        // 隣接ノードを更新
        for (const neighborId in graph[currentId]) {
            if (visited.has(neighborId)) continue;

            const distance = distances[currentId] + graph[currentId][neighborId];
            if (distance < distances[neighborId]) {
                distances[neighborId] = distance;
                previous[neighborId] = currentId;
            }
        }
    }

    return null; // 経路が見つからない
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
        // 経路をクリア
        clearRoute();

        // deck.glレイヤー（MapboxLayer）を削除
        ['network-link-layer', 'network-node-layer', 'route-layer', 'space-circle-layer', 'selected-nodes-layer', 'facility-layer'].forEach(layerId => {
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
            // ---------------------------------------------------------------
            // 優先度1: ノードのクリック判定 (deck.gl レイヤー)
            // ---------------------------------------------------------------
            // マップに関連付けられたdeck.glインスタンスを取得
            // MapboxLayerを使用している場合、mapインスタンスに _deck または __deck として保持されています
            const deckInstance = map.__deck || map._deck;

            if (deckInstance) {
                // pickObject: 画面上のピクセル座標(x,y)から、そこに描画されているオブジェクトを特定する
                // 経緯度計算を行わないため、3D表示時の視差ズレが一切発生しません
                const pickInfo = deckInstance.pickObject({
                    x: e.point.x,
                    y: e.point.y,
                    radius: 5, // クリック判定の許容誤差(ピクセル)
                    layerIds: ['network-node-layer'] // ノードレイヤーのみを対象にする
                });

                // ノードがクリックされた場合
                if (pickInfo && pickInfo.object) {
                    // 経路検索モードなら選択処理
                    if (routeSelectionMode) {
                        handleRouteNodeSelection(pickInfo.object);
                        return; // 処理完了
                    }

                    // 通常モードなら情報表示
                    const coords = pickInfo.coordinate || pickInfo.object.geometry.coordinates;
                    showNodeInfo(pickInfo.object, coords);
                    return; // ノードをクリックしたら、後ろの床(Facility)の判定はしない
                }
            }

            // ---------------------------------------------------------------
            // 優先度2: Facilityのクリック判定 (deck.gl レイヤー)
            // ---------------------------------------------------------------
            // ノードがクリックされていない場合のみ実行

            if (deckInstance) {
                // pickObjectでFacilityレイヤーをチェック
                const facilityPickInfo = deckInstance.pickObject({
                    x: e.point.x,
                    y: e.point.y,
                    radius: 5,
                    layerIds: ['facility-layer']
                });

                if (facilityPickInfo && facilityPickInfo.object) {
                    // 経路検索モードの場合
                    if (routeSelectionMode) {
                        // Facilityから最も近いノードを探して選択
                        const coords = facilityPickInfo.object.properties._originalCoords ||
                            (facilityPickInfo.object.geometry.coordinates.length >= 2 ?
                                [facilityPickInfo.object.geometry.coordinates[0], facilityPickInfo.object.geometry.coordinates[1]] :
                                facilityPickInfo.object.geometry.coordinates);
                        const nearestNode = findNearestNodeToFacility(coords[0], coords[1]);
                        if (nearestNode) {
                            handleRouteNodeSelection(nearestNode);
                        }
                        return;
                    }

                    // 通常モードの場合 (Facility情報をポップアップ表示)
                    const coords = facilityPickInfo.coordinate ||
                        facilityPickInfo.object.properties._originalCoords ||
                        (facilityPickInfo.object.geometry.coordinates.length >= 2 ?
                            [facilityPickInfo.object.geometry.coordinates[0], facilityPickInfo.object.geometry.coordinates[1]] :
                            facilityPickInfo.object.geometry.coordinates);
                    showFacilityInfo(facilityPickInfo.object, coords);
                    return;
                }
            }

            // ---------------------------------------------------------------
            // 優先度3: Spaceのクリック判定 (MapLibre レイヤー)
            // ---------------------------------------------------------------
            // queryRenderedFeatures: 画面上のピクセル座標からMapLibreレイヤーを特定する
            const features = map.queryRenderedFeatures(e.point, {
                layers: config.floors.map(f => `space-layer-${f.id}`)
            });

            if (features.length > 0) {
                const spaceFeature = features[0];

                // 経路検索モードの場合
                if (routeSelectionMode) {
                    handleRouteFacilitySelection(spaceFeature);
                    return;
                }

                // 通常モードの場合 (右下に小さく軽めに表示)
                showSpaceInfo(spaceFeature.properties);
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
    const [nodes, links] = await Promise.all([
        fetch(`${dataDir}${config.dataFiles.node}`).then(res => res.json()),
        fetch(`${dataDir}${config.dataFiles.link}`).then(res => res.json())
    ]);

    nodesData = nodes;
    linksData = links;
    nodeFloorMap = {};

    // FacilityデータとFloorデータを読み込む（階層ごと）
    facilitiesData = {};
    floorsData = {};
    const facilityPromises = config.floors.map(async f => {
        // Facilityデータを読み込む
        const facilityFileName = stationLogic.getSpaceFileName(config.filePrefix, f.id).replace('Space', 'Facility');
        try {
            const facilityResponse = await fetch(`${dataDir}${facilityFileName}`);
            if (facilityResponse.ok && facilityResponse.status === 200) {
                const facilityData = await facilityResponse.json();
                if (facilityData && facilityData.type === 'FeatureCollection') {
                    facilitiesData[f.id] = facilityData;
                }
            }
        } catch (e) {
            // Facilityファイルが存在しない場合は無視
        }

        // Floorデータを読み込む（階層名取得用）
        const floorFileName = stationLogic.getSpaceFileName(config.filePrefix, f.id).replace('Space', 'Floor');
        try {
            const floorResponse = await fetch(`${dataDir}${floorFileName}`);
            if (floorResponse.ok && floorResponse.status === 200) {
                const floorData = await floorResponse.json();
                if (floorData && floorData.type === 'FeatureCollection' && floorData.features.length > 0) {
                    floorsData[f.id] = floorData.features[0]; // 最初のfeatureを使用
                }
            }
        } catch (e) {
            // Floorファイルが存在しない場合は無視
        }

        return null;
    });
    await Promise.all(facilityPromises);

    // グラフを構築
    routeGraph = buildRouteGraph();

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

        // Facilityレイヤーは後でdeck.glレイヤーとして追加（3D空間での正確な配置のため）

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
        pickable: true, // クリック可能（経路検索用）
        getPointRadius: NODE_RADIUS,
        // [修正] 当たり判定を大きくして操作性を向上（3D表示での視差を考慮）
        radiusMinPixels: 6,
        radiusMaxPixels: 10,
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
                // 元の2D座標を保存（経路検索用）
                if (!f.properties._originalCoords) {
                    f.properties._originalCoords = [coords[0], coords[1]];
                }
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

    // Facilityレイヤーをdeck.glレイヤーとして追加（3D空間での正確な配置）
    // 全ての階層のFacilityを1つのレイヤーにまとめる
    const allFacilities = [];
    for (const floorId in facilitiesData) {
        if (facilitiesData[floorId]) {
            facilitiesData[floorId].features.forEach(facility => {
                // floor_idから階層を特定
                let facilityFloor = null;

                // floorsDataからfloor_idが一致するFloorを探す
                for (const fId in floorsData) {
                    const floorData = floorsData[fId];
                    if (floorData.properties.id === facility.properties.floor_id) {
                        const ordinal = parseFloat(floorData.properties.ordinal);
                        if (!isNaN(ordinal)) {
                            facilityFloor = ordinal;
                        }
                        break;
                    }
                }

                // floorsDataで見つからない場合、config.floorsから対応する階層を探す
                if (facilityFloor === null) {
                    // floorId（config.floorsのid）から階層を取得
                    const floorConfig = config.floors.find(f => f.id === floorId);
                    if (floorConfig) {
                        facilityFloor = floorConfig.nodeFloor;
                    } else {
                        // デフォルトとしてfloorIdを使用（数値の場合）
                        const numericFloor = parseFloat(floorId);
                        if (!isNaN(numericFloor)) {
                            facilityFloor = numericFloor;
                        }
                    }
                }

                // 階層が見つからない場合はスキップ
                if (facilityFloor === null) {
                    console.warn(`[${config.stationName}] Facility ${facility.properties.id} の階層を特定できませんでした`);
                    return;
                }

                const z = config.floorOffsets[String(facilityFloor)] ?? 0;
                const coords = facility.geometry.coordinates;

                allFacilities.push({
                    type: 'Feature',
                    geometry: {
                        type: 'Point',
                        coordinates: [coords[0], coords[1], z + SPACE_HEIGHT + 0.5] // Spaceレイヤーの上に表示
                    },
                    properties: {
                        ...facility.properties,
                        _originalCoords: [coords[0], coords[1]],
                        _floor: facilityFloor
                    }
                });
            });
        }
    }

    const facilityLayer = new MapboxLayer({
        id: 'facility-layer',
        type: deck.GeoJsonLayer,
        data: {
            type: 'FeatureCollection',
            features: allFacilities
        },
        pickable: true,
        getPointRadius: 1.0, // ノードより小さく
        radiusMinPixels: 4, // 拡大縮小してもサイズが変わらないように固定
        radiusMaxPixels: 4, // 拡大縮小してもサイズが変わらないように固定
        getFillColor: [100, 116, 139, 220], // シックなグレー（slate-500）
        stroked: true,
        getLineColor: [71, 85, 105, 255], // やや濃いグレー（slate-600）
        lineWidthMinPixels: 1, // 枠線を細く
        lineWidthMaxPixels: 1, // 拡大縮小してもサイズが変わらないように固定
        parameters: {
            depthTest: true,
            depthFunc: 519,
            blend: true,
            blendFunc: [770, 771, 1, 771]
        }
    });
    map.addLayer(facilityLayer);


    // 選択されたノードを表示するレイヤー（出発点・到着点）
    const selectedNodesLayer = new MapboxLayer({
        id: 'selected-nodes-layer',
        type: deck.GeoJsonLayer,
        data: {
            type: 'FeatureCollection',
            features: []
        },
        pickable: false,
        getPointRadius: 2,
        radiusMinPixels: 8,
        radiusMaxPixels: 12,
        getFillColor: (d) => {
            // 出発点は緑、到着点は赤
            if (d.properties.type === 'start') {
                return [34, 197, 94, 255]; // 緑
            } else if (d.properties.type === 'end') {
                return [239, 68, 68, 255]; // 赤
            }
            return [255, 255, 255, 255];
        },
        stroked: true,
        getLineColor: [255, 255, 255, 255],
        lineWidthMinPixels: 2,
        lineWidthMaxPixels: 3,
        parameters: {
            depthTest: false, // 常に最前面に表示
            blend: true,
            blendFunc: [770, 771, 1, 771]
        },
        dataTransform: (data) => {
            data.features.forEach(f => {
                const nodeId = f.properties.node_id;
                const node = nodesData.features.find(n => n.properties.node_id === nodeId);
                if (node) {
                    const floor = nodeFloorMap[nodeId] ?? node.properties.floor;
                    const z = config.floorOffsets[String(floor)] ?? 0;
                    const coords = f.properties._originalCoords ||
                        (node.geometry.coordinates.length >= 2 ?
                            [node.geometry.coordinates[0], node.geometry.coordinates[1]] :
                            node.geometry.coordinates);
                    f.geometry.coordinates = [coords[0], coords[1], z + NODE_Z_OFFSET + 0.1];
                }
            });
            return data;
        }
    });
    map.addLayer(selectedNodesLayer);

    // 経路検索レイヤーを初期化（空のデータ）
    const routeLayer = new MapboxLayer({
        id: 'route-layer',
        type: deck.GeoJsonLayer,
        data: {
            type: 'FeatureCollection',
            features: []
        },
        pickable: false,
        lineWidthMinPixels: 5,
        lineWidthMaxPixels: 8,
        getLineColor: [239, 68, 68, 255], // 赤色
        parameters: {
            depthTest: false,
            blend: true,
            blendFunc: [770, 771, 1, 771]
        },
        dataTransform: (data) => {
            data.features.forEach(f => {
                if (f.geometry.type === 'LineString') {
                    const coords = f.geometry.coordinates;
                    const startNode = nodesData.features.find(n => n.properties.node_id === f.properties.start_id);
                    const endNode = nodesData.features.find(n => n.properties.node_id === f.properties.end_id);
                    if (startNode && endNode) {
                        const startFloor = nodeFloorMap[startNode.properties.node_id] ?? startNode.properties.floor;
                        const endFloor = nodeFloorMap[endNode.properties.node_id] ?? endNode.properties.floor;
                        const startZ = config.floorOffsets[String(startFloor)] ?? 0;
                        const endZ = config.floorOffsets[String(endFloor)] ?? 0;
                        f.geometry.coordinates = [
                            [coords[0][0], coords[0][1], startZ + LINK_Z_OFFSET + 0.2],
                            [coords[1][0], coords[1][1], endZ + LINK_Z_OFFSET + 0.2]
                        ];
                    }
                }
            });
            return data;
        }
    });
    map.addLayer(routeLayer);
}

// ============================================================================
// 経路検索機能
// ============================================================================

/**
 * ノード選択ハンドラ（経路検索用）
 */
function handleRouteNodeSelection(node) {
    const nodeId = node.properties.node_id;
    const floor = nodeFloorMap[nodeId] ?? node.properties.floor;
    const floorName = stationLogic.getFloorName(floor);

    if (routeSelectionMode === 'start') {
        routeStartNode = nodeId;
        document.getElementById('start-info').textContent = `Node (${floorName})`;
        document.getElementById('select-start').classList.remove('active');
        routeSelectionMode = null;
    } else if (routeSelectionMode === 'end') {
        routeEndNode = nodeId;
        document.getElementById('end-info').textContent = `Node (${floorName})`;
        document.getElementById('select-end').classList.remove('active');
        routeSelectionMode = null;
    }

    updateRouteSearchButton();
    updateSelectedNodesLayer();
}

/**
 * Facility選択ハンドラ（経路検索用）
 * Spaceレイヤーのfeatureを受け取り、そのSpace内にあるFacilityを探してノードを選択する
 */
function handleRouteFacilitySelection(spaceFeature) {
    // Spaceレイヤーのfeatureから、そのSpace内にあるFacilityを探す
    const spaceFloorId = spaceFeature.properties.floor_id;
    const spacePolygon = spaceFeature.geometry.coordinates;
    let spaceRings = [];

    if (spaceFeature.geometry.type === 'Polygon') {
        spaceRings = [spacePolygon[0]]; // 最初のリングが外側
    } else if (spaceFeature.geometry.type === 'MultiPolygon') {
        spaceRings = spacePolygon.map(poly => poly[0]); // 各ポリゴンの最初のリング
    }

    // 同じ階層のFacilityを探す
    let nearestFacility = null;
    let minFacilityDistance = Infinity;

    for (const floorId in facilitiesData) {
        facilitiesData[floorId].features.forEach(facility => {
            // floor_idが一致するFacilityのみチェック
            if (facility.properties.floor_id === spaceFloorId) {
                const facilityCoords = facility.geometry.coordinates;

                // FacilityがSpaceポリゴン内にあるかチェック
                let isInside = false;
                for (const ring of spaceRings) {
                    if (pointInPolygon(facilityCoords, ring)) {
                        isInside = true;
                        break;
                    }
                }

                if (isInside) {
                    // Spaceの中心からの距離を計算（複数のFacilityがある場合の優先順位付け用）
                    const spaceCenter = spaceRings[0][0]; // 最初のリングの最初の点を中心として使用
                    const distance = Math.sqrt(
                        Math.pow(facilityCoords[0] - spaceCenter[0], 2) +
                        Math.pow(facilityCoords[1] - spaceCenter[1], 2)
                    );
                    if (distance < minFacilityDistance) {
                        minFacilityDistance = distance;
                        nearestFacility = facility;
                    }
                }
            }
        });
    }

    if (!nearestFacility) {
        alert('Space内にFacilityが見つかりませんでした');
        return;
    }

    // Facilityから最も近いノードを探す
    const coords = nearestFacility.geometry.coordinates;
    const nearestNode = findNearestNodeToFacility(coords[0], coords[1]);

    if (!nearestNode) {
        alert('Facilityに最も近いノードが見つかりませんでした');
        return;
    }

    const nodeId = nearestNode.properties.node_id;
    const floor = nodeFloorMap[nodeId] ?? nearestNode.properties.floor;
    const floorName = stationLogic.getFloorName(floor);
    const categoryName = getFacilityCategoryName(nearestFacility.properties.category);

    if (routeSelectionMode === 'start') {
        routeStartNode = nodeId;
        document.getElementById('start-info').textContent = `${categoryName} (${floorName})`;
        document.getElementById('select-start').classList.remove('active');
        routeSelectionMode = null;
    } else if (routeSelectionMode === 'end') {
        routeEndNode = nodeId;
        document.getElementById('end-info').textContent = `${categoryName} (${floorName})`;
        document.getElementById('select-end').classList.remove('active');
        routeSelectionMode = null;
    }

    updateRouteSearchButton();
    updateSelectedNodesLayer();
}

/**
 * Space情報を右下に表示する関数
 * @param {Object} props - Spaceのproperties
 */
function showSpaceInfo(props) {
    const panel = document.getElementById('space-info-panel');
    const content = document.getElementById('space-info-content');

    if (!panel || !content) {
        console.warn('空間情報パネルの要素が見つかりません');
        return;
    }

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

    let html = '';

    if (props.category) {
        html += `<div class="space-category">${getCategoryName(props.category)}</div>`;
        html += `<div class="space-code">${props.category}</div>`;
    }

    // 名称は空白でない場合のみ表示
    if (props.name && props.name.trim() !== '') {
        html += `<div class="space-name">${props.name.trim()}</div>`;
    }

    content.innerHTML = html;

    // 既存のタイマーをクリア
    if (showSpaceInfo.timeoutId) {
        clearTimeout(showSpaceInfo.timeoutId);
    }

    // 表示アニメーション
    panel.style.display = 'block';
    // 次のフレームでアニメーションを開始
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            panel.classList.add('show');
        });
    });

    // 3秒後に自動的に非表示
    showSpaceInfo.timeoutId = setTimeout(() => {
        panel.classList.remove('show');
        setTimeout(() => {
            panel.style.display = 'none';
        }, 300);
    }, 3000);
}

/**
 * Facilityカテゴリ名を取得
 */
function getFacilityCategoryName(category) {
    const categoryMap = {
        'F001': 'トイレ（男性）',
        'F002': 'トイレ（女性）',
        'F003': 'トイレ（共用）',
        'F011': '階段',
        'F012': 'エレベーター',
        'F013': 'エスカレーター',
        'F017': '出入口',
        'F027': 'AED',
        'F045': '公衆無線LAN'
    };
    return categoryMap[category] || category;
}

/**
 * Facility情報を表示する関数
 * @param {Object} feature - FacilityのGeoJSON feature
 * @param {Array<number>} lngLat - [経度, 緯度] の配列
 */
function showFacilityInfo(feature, lngLat) {
    if (currentPopup) {
        currentPopup.remove();
    }

    const props = feature.properties;
    const categoryName = getFacilityCategoryName(props.category);

    // floor_idから階層情報を取得
    let floorName = '不明';
    if (props.floor_id) {
        // floorsDataからfloor_idが一致するFloorを探す
        for (const floorId in floorsData) {
            const floorData = floorsData[floorId];
            if (floorData.properties.id === props.floor_id) {
                // Floorのordinalから階層名を取得
                const ordinal = parseFloat(floorData.properties.ordinal);
                if (!isNaN(ordinal)) {
                    floorName = stationLogic.getFloorName(ordinal);
                } else if (floorData.properties.name) {
                    floorName = floorData.properties.name;
                }
                break;
            }
        }

        // floorsDataで見つからない場合、configから階層を探す
        if (floorName === '不明') {
            // floor_idが一致する階層を探す（簡易的に階層IDを使用）
            const floorConfig = config.floors.find(f => {
                // より正確にはFloorデータを読み込んで確認する必要があるが、簡易的に階層IDを使用
                return true;
            });
            if (floorConfig) {
                floorName = stationLogic.getFloorName(floorConfig.nodeFloor);
            }
        }
    }

    let html = '<div class="space-popup">';
    html += '<h3>設備情報</h3>';

    if (props.category) {
        html += '<div class="info-row">';
        html += '<span class="info-label">種別:</span>';
        html += `<span class="info-value">${categoryName}</span>`;
        html += '</div>';
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

    html += '<div class="info-row">';
    html += '<span class="info-label">階層:</span>';
    html += `<span class="info-value">${floorName}</span>`;
    html += '</div>';

    if (props.source) {
        const sourceText = props.source === '1' ? 'フロアマップ' :
            props.source === '2' ? 'CAD' :
                props.source === '3' ? 'BIM' :
                    props.source === '4' ? '3次元地図' : 'その他';
        html += '<div class="info-row">';
        html += '<span class="info-label">データ源:</span>';
        html += `<span class="info-value">${sourceText}</span>`;
        html += '</div>';
    }

    html += '</div>';

    currentPopup = new maplibregl.Popup({
        closeButton: true,
        className: 'space-info-popup'
    })
        .setLngLat(lngLat)
        .setHTML(html)
        .addTo(map);
}

/**
 * 経路検索ボタンの状態を更新
 */
function updateRouteSearchButton() {
    const searchBtn = document.getElementById('search-route');
    if (routeStartNode && routeEndNode) {
        searchBtn.disabled = false;
    } else {
        searchBtn.disabled = true;
    }
}

/**
 * 選択されたノードレイヤーを更新
 */
function updateSelectedNodesLayer() {
    const selectedFeatures = [];

    if (routeStartNode) {
        const startNode = nodesData.features.find(n => n.properties.node_id === routeStartNode);
        if (startNode) {
            const coords = startNode.properties._originalCoords ||
                (startNode.geometry.coordinates.length >= 2 ?
                    [startNode.geometry.coordinates[0], startNode.geometry.coordinates[1]] :
                    startNode.geometry.coordinates);
            selectedFeatures.push({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: coords
                },
                properties: {
                    node_id: routeStartNode,
                    type: 'start',
                    _originalCoords: coords
                }
            });
        }
    }

    if (routeEndNode) {
        const endNode = nodesData.features.find(n => n.properties.node_id === routeEndNode);
        if (endNode) {
            const coords = endNode.properties._originalCoords ||
                (endNode.geometry.coordinates.length >= 2 ?
                    [endNode.geometry.coordinates[0], endNode.geometry.coordinates[1]] :
                    endNode.geometry.coordinates);
            selectedFeatures.push({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: coords
                },
                properties: {
                    node_id: routeEndNode,
                    type: 'end',
                    _originalCoords: coords
                }
            });
        }
    }

    const selectedData = {
        type: 'FeatureCollection',
        features: selectedFeatures
    };

    // 選択ノードレイヤーを更新
    const selectedLayer = map.getLayer('selected-nodes-layer');
    if (selectedLayer) {
        map.removeLayer('selected-nodes-layer');
        const MapboxLayer = deck.MapboxLayer || window.MapboxLayer;
        const newSelectedLayer = new MapboxLayer({
            id: 'selected-nodes-layer',
            type: deck.GeoJsonLayer,
            data: selectedData,
            pickable: false,
            getPointRadius: 2,
            radiusMinPixels: 8,
            radiusMaxPixels: 12,
            getFillColor: (d) => {
                // 出発点は緑、到着点は赤
                if (d.properties.type === 'start') {
                    return [34, 197, 94, 255]; // 緑
                } else if (d.properties.type === 'end') {
                    return [239, 68, 68, 255]; // 赤
                }
                return [255, 255, 255, 255];
            },
            stroked: true,
            getLineColor: [255, 255, 255, 255],
            lineWidthMinPixels: 2,
            lineWidthMaxPixels: 3,
            parameters: {
                depthTest: false, // 常に最前面に表示
                blend: true,
                blendFunc: [770, 771, 1, 771]
            },
            dataTransform: (data) => {
                data.features.forEach(f => {
                    const nodeId = f.properties.node_id;
                    const node = nodesData.features.find(n => n.properties.node_id === nodeId);
                    if (node) {
                        const floor = nodeFloorMap[nodeId] ?? node.properties.floor;
                        const z = config.floorOffsets[String(floor)] ?? 0;
                        const coords = f.properties._originalCoords ||
                            (node.geometry.coordinates.length >= 2 ?
                                [node.geometry.coordinates[0], node.geometry.coordinates[1]] :
                                node.geometry.coordinates);
                        f.geometry.coordinates = [coords[0], coords[1], z + NODE_Z_OFFSET + 0.1];
                    }
                });
                return data;
            }
        });
        map.addLayer(newSelectedLayer);
    }
}

/**
 * 経路を描画
 */
function drawRoute(path) {
    if (!path || path.length < 2) {
        return;
    }

    const routeFeatures = [];
    for (let i = 0; i < path.length - 1; i++) {
        const startNode = nodesData.features.find(n => n.properties.node_id === path[i]);
        const endNode = nodesData.features.find(n => n.properties.node_id === path[i + 1]);

        if (startNode && endNode) {
            const startCoords = startNode.geometry.coordinates;
            const endCoords = endNode.geometry.coordinates;

            routeFeatures.push({
                type: 'Feature',
                geometry: {
                    type: 'LineString',
                    coordinates: [
                        [startCoords[0], startCoords[1]],
                        [endCoords[0], endCoords[1]]
                    ]
                },
                properties: {
                    start_id: path[i],
                    end_id: path[i + 1]
                }
            });
        }
    }

    const routeData = {
        type: 'FeatureCollection',
        features: routeFeatures
    };

    // 経路レイヤーを更新
    const routeLayer = map.getLayer('route-layer');
    if (routeLayer) {
        // MapboxLayerのデータを更新するために、一度削除して再追加
        map.removeLayer('route-layer');
        const MapboxLayer = deck.MapboxLayer || window.MapboxLayer;
        const newRouteLayer = new MapboxLayer({
            id: 'route-layer',
            type: deck.GeoJsonLayer,
            data: routeData,
            pickable: false,
            lineWidthMinPixels: 5,
            lineWidthMaxPixels: 8,
            getLineColor: [239, 68, 68, 255], // 赤色
            parameters: {
                depthTest: false,
                blend: true,
                blendFunc: [770, 771, 1, 771]
            },
            dataTransform: (data) => {
                data.features.forEach(f => {
                    if (f.geometry.type === 'LineString') {
                        const coords = f.geometry.coordinates;
                        const startNode = nodesData.features.find(n => n.properties.node_id === f.properties.start_id);
                        const endNode = nodesData.features.find(n => n.properties.node_id === f.properties.end_id);
                        if (startNode && endNode) {
                            const startFloor = nodeFloorMap[startNode.properties.node_id] ?? startNode.properties.floor;
                            const endFloor = nodeFloorMap[endNode.properties.node_id] ?? endNode.properties.floor;
                            const startZ = config.floorOffsets[String(startFloor)] ?? 0;
                            const endZ = config.floorOffsets[String(endFloor)] ?? 0;
                            f.geometry.coordinates = [
                                [coords[0][0], coords[0][1], startZ + LINK_Z_OFFSET + 0.2],
                                [coords[1][0], coords[1][1], endZ + LINK_Z_OFFSET + 0.2]
                            ];
                        }
                    }
                });
                return data;
            }
        });
        map.addLayer(newRouteLayer);
    }
}

/**
 * 経路をクリア
 */
function clearRoute() {
    routePath = null;
    routeStartNode = null;
    routeEndNode = null;
    routeSelectionMode = null;

    document.getElementById('start-info').textContent = '未選択';
    document.getElementById('end-info').textContent = '未選択';
    document.getElementById('select-start').classList.remove('active');
    document.getElementById('select-end').classList.remove('active');
    updateRouteSearchButton();
    updateSelectedNodesLayer();

    // 経路レイヤーをクリア
    const routeData = {
        type: 'FeatureCollection',
        features: []
    };
    const routeLayer = map.getLayer('route-layer');
    if (routeLayer) {
        // MapboxLayerのデータを更新するために、一度削除して再追加
        map.removeLayer('route-layer');
        const MapboxLayer = deck.MapboxLayer || window.MapboxLayer;
        const newRouteLayer = new MapboxLayer({
            id: 'route-layer',
            type: deck.GeoJsonLayer,
            data: routeData,
            pickable: false,
            lineWidthMinPixels: 5,
            lineWidthMaxPixels: 8,
            getLineColor: [239, 68, 68, 255], // 赤色
            parameters: {
                depthTest: false,
                blend: true,
                blendFunc: [770, 771, 1, 771]
            },
            dataTransform: (data) => {
                data.features.forEach(f => {
                    if (f.geometry.type === 'LineString') {
                        const coords = f.geometry.coordinates;
                        const startNode = nodesData.features.find(n => n.properties.node_id === f.properties.start_id);
                        const endNode = nodesData.features.find(n => n.properties.node_id === f.properties.end_id);
                        if (startNode && endNode) {
                            const startFloor = nodeFloorMap[startNode.properties.node_id] ?? startNode.properties.floor;
                            const endFloor = nodeFloorMap[endNode.properties.node_id] ?? endNode.properties.floor;
                            const startZ = config.floorOffsets[String(startFloor)] ?? 0;
                            const endZ = config.floorOffsets[String(endFloor)] ?? 0;
                            f.geometry.coordinates = [
                                [coords[0][0], coords[0][1], startZ + LINK_Z_OFFSET + 0.2],
                                [coords[1][0], coords[1][1], endZ + LINK_Z_OFFSET + 0.2]
                            ];
                        }
                    }
                });
                return data;
            }
        });
        map.addLayer(newRouteLayer);
    }
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

    // 経路検索UIのイベントハンドラ
    document.getElementById('select-start').addEventListener('click', () => {
        if (routeSelectionMode === 'start') {
            routeSelectionMode = null;
            document.getElementById('select-start').classList.remove('active');
        } else {
            routeSelectionMode = 'start';
            document.getElementById('select-start').classList.add('active');
            document.getElementById('select-end').classList.remove('active');
        }
    });

    document.getElementById('select-end').addEventListener('click', () => {
        if (routeSelectionMode === 'end') {
            routeSelectionMode = null;
            document.getElementById('select-end').classList.remove('active');
        } else {
            routeSelectionMode = 'end';
            document.getElementById('select-end').classList.add('active');
            document.getElementById('select-start').classList.remove('active');
        }
    });

    document.getElementById('search-route').addEventListener('click', () => {
        if (!routeStartNode || !routeEndNode || !routeGraph) {
            alert('出発点と到着点を選択してください');
            return;
        }

        if (routeStartNode === routeEndNode) {
            alert('出発点と到着点が同じです');
            return;
        }

        const path = dijkstra(routeGraph, routeStartNode, routeEndNode);
        if (!path) {
            alert('経路が見つかりませんでした');
            return;
        }

        routePath = path;
        drawRoute(path);
    });

    document.getElementById('clear-route').addEventListener('click', () => {
        clearRoute();
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

