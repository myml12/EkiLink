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
    if (typeof buildRouteGraph === 'function') {
        routeGraph = buildRouteGraph();
    } else {
        console.error('buildRouteGraph関数が見つかりません。route.jsが正しく読み込まれているか確認してください。');
        routeGraph = {};
    }

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
        
        // 施設境界をより明確にするため、fill-extrusionの枠線効果を改善
        map.addLayer({
            id: `space-layer-${f.id}`,
            type: 'fill-extrusion',
            source: `space-src-${f.id}`,
            paint: {
                'fill-extrusion-color': [
                    'match', ['get', 'category'],
                    'B021', '#ff8a65', // 階段
                    'B019', '#4fc3f7', // 通路
                    'B028', '#fbbf24', // プラットホーム
                    'B029', '#60a5fa', // 通路/コンコース
                    'B022', '#a78bfa', // エレベーター
                    'B023', '#34d399', // エスカレーター
                    config.floorColors[f.id]
                ],
                'fill-extrusion-base': f.offset,
                'fill-extrusion-height': f.offset + SPACE_HEIGHT,
                'fill-extrusion-opacity': 0.45 // 不透明度を上げて境界を明確に
            }
        });

        // 施設境界線レイヤーを追加（境界をより明確にする）
        map.addLayer({
            id: `space-outline-${f.id}`,
            type: 'line',
            source: `space-src-${f.id}`,
            paint: {
                'line-color': [
                    'match', ['get', 'category'],
                    'B021', '#ff6b35', // 階段
                    'B019', '#0ea5e9', // 通路
                    'B028', '#f59e0b', // プラットホーム
                    'B029', '#3b82f6', // 通路/コンコース
                    '#64748b' // デフォルト
                ],
                'line-width': 1.5,
                'line-opacity': 0.7
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
        getPointRadius: 1.5,
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

