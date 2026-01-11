// ============================================================================
// フロアプランビュー機能
// ============================================================================

// フロアプランビューの定数
const FLOOR_PLAN_EXTRUSION_BASE = 0;       // フロアプランビューでのSpace高さベース
const FLOOR_PLAN_EXTRUSION_HEIGHT = 0.1;   // フロアプランビューでのSpace高さ
const FLOOR_PLAN_NODE_Z = 0.5;             // フロアプランビューでのノードZ座標
const FLOOR_PLAN_LINK_Z = 0.3;             // フロアプランビューでのリンクZ座標
const FLOOR_PLAN_ROUTE_Z = 0.6;            // フロアプランビューでの経路Z座標
const FLOOR_PLAN_FACILITY_Z = 0.8;         // フロアプランビューでの設備Z座標

// フロアプランビューの状態
let isFloorPlanView = false;
let selectedFloor = null; // 選択された階層（null = 全階層表示）
let savedCameraState = null; // 3Dビュー時のカメラ状態を保存

/**
 * フロアプランビューのセットアップ（イベントリスナー等）
 */
function setupFloorPlanView() {
    const hierarchyToggle = document.getElementById('hierarchy-display-toggle');
    const floorSelect = document.getElementById('floor-select');
    const floorSelectorDropdown = document.getElementById('floor-selector-dropdown');
    
    // 階層表示のトグルスイッチ
    if (hierarchyToggle) {
        hierarchyToggle.addEventListener('change', (e) => {
            if (e.target.checked) {
                // 階層表示をオンにする
                enterFloorPlanView();
            } else {
                // 階層表示をオフにする
                exitFloorPlanView();
            }
        });
    }
    
    // 階層選択ドロップダウン
    if (floorSelect) {
        floorSelect.addEventListener('change', (e) => {
            const value = e.target.value;
            if (value === 'all') {
                selectFloor(null);
            } else {
                const floorValue = parseFloat(value);
                if (!isNaN(floorValue)) {
                    const floorConfig = config.floors.find(f => f.nodeFloor === floorValue);
                    selectFloor(floorValue, floorConfig ? floorConfig.id : null);
                }
            }
        });
    }
}

/**
 * フロアプランビューに入る
 */
function enterFloorPlanView() {
    if (!map || !config) return;
    
    isFloorPlanView = true;
    
    // 現在のカメラ状態を保存
    savedCameraState = {
        center: map.getCenter().toArray(),
        zoom: map.getZoom(),
        pitch: map.getPitch(),
        bearing: map.getBearing()
    };
    
    // カメラを上から見た視点に変更
    map.easeTo({
        pitch: 0,
        bearing: 0,
        duration: 500
    });
    
    // ドロップダウンを表示
    const floorSelectorDropdown = document.getElementById('floor-selector-dropdown');
    if (floorSelectorDropdown) {
        floorSelectorDropdown.classList.add('show');
    }
    
    // 階層セレクターを構築
    buildFloorSelector();
    
    // デフォルトで全階層表示
    selectFloor(null);
}

/**
 * フロアプランビューを終了
 */
function exitFloorPlanView() {
    if (!map) return;
    
    isFloorPlanView = false;
    selectedFloor = null;
    
    // 保存されたカメラ状態に戻す
    if (savedCameraState) {
        map.easeTo({
            center: savedCameraState.center,
            zoom: savedCameraState.zoom,
            pitch: savedCameraState.pitch,
            bearing: savedCameraState.bearing,
            duration: 500
        });
        savedCameraState = null;
    } else {
        // デフォルトの3D視点に戻す
        map.easeTo({
            pitch: config.pitch || 65,
            bearing: config.bearing || 0,
            duration: 500
        });
    }
    
    // ドロップダウンを非表示
    const floorSelectorDropdown = document.getElementById('floor-selector-dropdown');
    if (floorSelectorDropdown) {
        floorSelectorDropdown.classList.remove('show');
    }
    
    // 階層選択をリセット
    const floorSelect = document.getElementById('floor-select');
    if (floorSelect) {
        floorSelect.value = 'all';
    }
    
    // 全レイヤーを表示（3D表示に戻す）
    showAllFloors();
}

/**
 * フロアセレクターを構築
 */
function buildFloorSelector() {
    const floorSelect = document.getElementById('floor-select');
    if (!floorSelect || !config) return;
    
    // 階層をソート（上から下へ）
    const sortedFloors = [...config.floors].sort((a, b) => b.nodeFloor - a.nodeFloor);
    
    // オプションを構築
    let html = '<option value="all">全階層</option>';
    
    sortedFloors.forEach(f => {
        const floorName = stationLogic.getFloorName(f.nodeFloor);
        html += `<option value="${f.nodeFloor}">${floorName}</option>`;
    });
    
    floorSelect.innerHTML = html;
}

/**
 * 特定の階層を選択
 * @param {number|null} floor - 階層番号（nullの場合は全階層表示）
 * @param {string} floorId - 階層ID
 */
function selectFloor(floor, floorId = null) {
    selectedFloor = floor;
    
    if (floor === null) {
        // 全階層表示
        showAllFloors();
        showToast('全階層を表示中です');
    } else {
        // 特定の階層のみ表示
        showSingleFloor(floor, floorId);
        const floorName = stationLogic.getFloorName(floor);
        showToast(`${floorName}を表示中です`);
    }
}

/**
 * 全階層を表示（3D表示）
 */
function showAllFloors() {
    if (!map || !config) return;
    
    // 全てのSpaceレイヤーを表示し、3D表示に戻す
    config.floors.forEach(f => {
        const layerId = `space-layer-${f.id}`;
        const outlineId = `space-outline-${f.id}`;
        
        if (map.getLayer(layerId)) {
            map.setLayoutProperty(layerId, 'visibility', 'visible');
            // 3D表示に戻す
            map.setPaintProperty(layerId, 'fill-extrusion-base', f.offset);
            map.setPaintProperty(layerId, 'fill-extrusion-height', f.offset + SPACE_HEIGHT);
        }
        if (map.getLayer(outlineId)) {
            map.setLayoutProperty(outlineId, 'visibility', 'visible');
        }
    });
    
    // deck.glレイヤーのフィルタリングをリセット
    updateDeckLayers(null);
}

/**
 * 単一の階層のみ表示
 * @param {number} floor - 階層番号
 * @param {string} floorId - 階層ID
 */
function showSingleFloor(floor, floorId) {
    if (!map || !config) return;
    
    // 選択された階層のSpaceレイヤーのみ表示し、フラットに表示
    config.floors.forEach(f => {
        const layerId = `space-layer-${f.id}`;
        const outlineId = `space-outline-${f.id}`;
        const isSelected = f.nodeFloor === floor;
        
        if (map.getLayer(layerId)) {
            map.setLayoutProperty(layerId, 'visibility', isSelected ? 'visible' : 'none');
            if (isSelected) {
                // フロアプランビューではフラットに表示
                map.setPaintProperty(layerId, 'fill-extrusion-base', FLOOR_PLAN_EXTRUSION_BASE);
                map.setPaintProperty(layerId, 'fill-extrusion-height', FLOOR_PLAN_EXTRUSION_HEIGHT);
            }
        }
        if (map.getLayer(outlineId)) {
            map.setLayoutProperty(outlineId, 'visibility', isSelected ? 'visible' : 'none');
        }
    });
    
    // deck.glレイヤーのフィルタリングを更新
    updateDeckLayers(floor);
}

/**
 * deck.glレイヤーを更新（階層フィルタリング）
 * @param {number|null} floor - 階層番号（nullの場合は全階層表示）
 */
function updateDeckLayers(floor) {
    if (!map || !nodesData) return;
    
    const MapboxLayer = deck.MapboxLayer || window.MapboxLayer;
    
    // ノードレイヤーを更新
    updateNodeLayer(floor, MapboxLayer);
    
    // リンクレイヤーを更新
    updateLinkLayer(floor, MapboxLayer);
    
    // Facilityレイヤーを更新
    updateFacilityLayer(floor, MapboxLayer);
    
    // Space Circle レイヤーを更新（ノードの枠線）
    updateSpaceCircleLayer(floor, MapboxLayer);
    
    // 経路レイヤーを更新（経路が存在する場合）
    if (routePath && routePath.length > 0) {
        updateRouteLayerForFloor(floor, MapboxLayer);
    }
}

/**
 * ノードレイヤーを更新
 */
function updateNodeLayer(floor, MapboxLayer) {
    if (!map.getLayer('network-node-layer')) return;
    
    // フィルタリングされたノードデータを作成
    let filteredFeatures = nodesData.features;
    if (floor !== null) {
        filteredFeatures = nodesData.features.filter(f => {
            const nodeFloor = nodeFloorMap[f.properties.node_id] ?? f.properties.floor;
            return nodeFloor === floor;
        });
    }
    
    const NODE_RADIUS = 1;
    const zOffset = floor !== null ? 0 : null; // フロアプランビューではZ=0に表示
    
    // 既存のレイヤーを削除
    map.removeLayer('network-node-layer');
    
    // 新しいレイヤーを追加
    const nodeLayer = new MapboxLayer({
        id: 'network-node-layer',
        type: deck.GeoJsonLayer,
        data: {
            type: 'FeatureCollection',
            features: filteredFeatures
        },
        pickable: true,
        getPointRadius: NODE_RADIUS,
        radiusMinPixels: 6,
        radiusMaxPixels: 10,
        getFillColor: (d) => {
            const nodeFloor = nodeFloorMap[d.properties.node_id] ?? d.properties.floor;
            return stationLogic.getFloorColor(nodeFloor);
        },
        stroked: true,
        getLineColor: (d) => {
            const nodeFloor = nodeFloorMap[d.properties.node_id] ?? d.properties.floor;
            const fillColor = stationLogic.getFloorColor(nodeFloor);
            return getNodeStrokeColor(fillColor);
        },
        getLineWidth: 1, // 明示的に設定してフィルタリング時にゴーストアウトラインを防ぐ
        lineWidthMinPixels: 1,
        lineWidthMaxPixels: 2,
        parameters: {
            depthTest: !isFloorPlanView,
            depthFunc: 519,
            blend: true,
            blendFunc: [770, 771, 1, 771]
        },
        dataTransform: (data) => {
            data.features.forEach(f => {
                const nodeFloor = nodeFloorMap[f.properties.node_id] ?? f.properties.floor;
                let z;
                if (isFloorPlanView && floor !== null) {
                    z = FLOOR_PLAN_NODE_Z; // フロアプランビューではフラットに表示
                } else {
                    z = (config.floorOffsets[String(nodeFloor)] ?? 0) + NODE_Z_OFFSET;
                }
                const coords = f.geometry.coordinates;
                if (!f.properties._originalCoords) {
                    f.properties._originalCoords = [coords[0], coords[1]];
                }
                f.geometry.coordinates = [coords[0], coords[1], z];
            });
            return data;
        }
    });
    map.addLayer(nodeLayer);
}

/**
 * リンクレイヤーを更新
 */
function updateLinkLayer(floor, MapboxLayer) {
    if (!map.getLayer('network-link-layer')) return;
    
    // フィルタリングされたリンクデータを作成
    let filteredFeatures = linksData.features;
    if (floor !== null) {
        filteredFeatures = linksData.features.filter(f => {
            const startFloor = nodeFloorMap[f.properties.start_id];
            const endFloor = nodeFloorMap[f.properties.end_id];
            // 両端が選択された階層にあるリンクのみ表示
            return startFloor === floor && endFloor === floor;
        });
    }
    
    // 既存のレイヤーを削除
    map.removeLayer('network-link-layer');
    
    // 新しいレイヤーを追加
    const linkLayer = new MapboxLayer({
        id: 'network-link-layer',
        type: deck.GeoJsonLayer,
        data: {
            type: 'FeatureCollection',
            features: filteredFeatures
        },
        pickable: false,
        lineWidthMinPixels: 2,
        lineWidthMaxPixels: 4,
        getLineColor: [0, 255, 255, 255],
        parameters: {
            depthTest: false,
            blend: true,
            blendFunc: [770, 771, 1, 771]
        },
        dataTransform: (data) => {
            data.features.forEach(f => {
                if (f.geometry.type === 'LineString') {
                    const startFloor = nodeFloorMap[f.properties.start_id];
                    const endFloor = nodeFloorMap[f.properties.end_id];
                    let startZ, endZ;
                    if (isFloorPlanView && floor !== null) {
                        startZ = FLOOR_PLAN_LINK_Z;
                        endZ = FLOOR_PLAN_LINK_Z;
                    } else {
                        startZ = (config.floorOffsets[String(startFloor)] ?? 0) + LINK_Z_OFFSET;
                        endZ = (config.floorOffsets[String(endFloor)] ?? 0) + LINK_Z_OFFSET;
                    }
                    const coords = f.geometry.coordinates;
                    f.geometry.coordinates = [
                        [coords[0][0], coords[0][1], startZ],
                        [coords[1][0], coords[1][1], endZ]
                    ];
                }
            });
            return data;
        }
    });
    map.addLayer(linkLayer);
}

/**
 * Facilityレイヤーを更新
 */
function updateFacilityLayer(floor, MapboxLayer) {
    if (!map.getLayer('facility-layer')) return;
    
    // 全てのFacilityを再構築
    const allFacilities = [];
    for (const floorId in facilitiesData) {
        if (facilitiesData[floorId]) {
            facilitiesData[floorId].features.forEach(facility => {
                let facilityFloor = null;
                
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
                
                if (facilityFloor === null) {
                    const floorConfig = config.floors.find(f => f.id === floorId);
                    if (floorConfig) {
                        facilityFloor = floorConfig.nodeFloor;
                    } else {
                        const numericFloor = parseFloat(floorId);
                        if (!isNaN(numericFloor)) {
                            facilityFloor = numericFloor;
                        }
                    }
                }
                
                if (facilityFloor === null) return;
                
                // フロアフィルタリング
                if (floor !== null && facilityFloor !== floor) return;
                
                let z;
                if (isFloorPlanView && floor !== null) {
                    z = FLOOR_PLAN_FACILITY_Z;
                } else {
                    z = (config.floorOffsets[String(facilityFloor)] ?? 0) + SPACE_HEIGHT + 0.5;
                }
                
                const coords = facility.geometry.coordinates;
                
                allFacilities.push({
                    type: 'Feature',
                    geometry: {
                        type: 'Point',
                        coordinates: [coords[0], coords[1], z]
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
    
    // 既存のレイヤーを削除
    map.removeLayer('facility-layer');
    
    // 新しいレイヤーを追加
    const facilityLayer = new MapboxLayer({
        id: 'facility-layer',
        type: deck.GeoJsonLayer,
        data: {
            type: 'FeatureCollection',
            features: allFacilities
        },
        pickable: true,
        getPointRadius: 1.0,
        radiusMinPixels: 4,
        radiusMaxPixels: 4,
        getFillColor: [100, 116, 139, 220],
        stroked: true,
        getLineColor: [71, 85, 105, 255],
        lineWidthMinPixels: 1,
        lineWidthMaxPixels: 1,
        parameters: {
            depthTest: !isFloorPlanView,
            depthFunc: 519,
            blend: true,
            blendFunc: [770, 771, 1, 771]
        }
    });
    map.addLayer(facilityLayer);
}

/**
 * Space Circle レイヤーを更新（ノードの枠線）
 * @param {number|null} floor - 階層番号（nullの場合は全階層表示）
 * @param {any} MapboxLayer - MapboxLayer クラス
 */
function updateSpaceCircleLayer(floor, MapboxLayer) {
    if (!map.getLayer('space-circle-layer')) return;
    
    // nodeSpaceMapが存在するか確認（map.jsで定義されているグローバル変数）
    if (typeof nodeSpaceMap === 'undefined') return;
    
    // フィルタリングされたノードの枠線データを作成
    const SPACE_CIRCLE_RADIUS = 1.5;
    let filteredNodes = nodesData.features;
    
    if (floor !== null) {
        filteredNodes = nodesData.features.filter(f => {
            const nodeFloor = nodeFloorMap[f.properties.node_id] ?? f.properties.floor;
            return nodeFloor === floor;
        });
    }
    
    const spaceCircleData = filteredNodes
        .filter(f => nodeSpaceMap[f.properties.node_id] !== null && nodeSpaceMap[f.properties.node_id] !== undefined)
        .map(f => {
            const nodeFloor = nodeFloorMap[f.properties.node_id] ?? f.properties.floor;
            let z;
            if (isFloorPlanView && floor !== null) {
                z = FLOOR_PLAN_NODE_Z; // フロアプランビューではフラットに表示
            } else {
                z = (config.floorOffsets[String(nodeFloor)] ?? 0) + NODE_Z_OFFSET;
            }
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
                    coordinates: [coords[0], coords[1], z]
                },
                properties: {
                    node_id: f.properties.node_id,
                    color: circleColor
                }
            };
        });
    
    // 既存のレイヤーを削除
    map.removeLayer('space-circle-layer');
    
    // 新しいレイヤーを追加
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
            depthTest: !isFloorPlanView,
            depthFunc: 519,
            blend: true,
            blendFunc: [770, 771, 1, 771]
        }
    });
    map.addLayer(spaceCircleLayer);
}

/**
 * 経路レイヤーを階層表示用に更新
 */
function updateRouteLayerForFloor(floor, MapboxLayer) {
    if (!map.getLayer('route-layer') || !routePath || routePath.length < 2) return;
    
    // 経路の線分を作成
    const routeFeatures = [];
    for (let i = 0; i < routePath.length - 1; i++) {
        const startNode = nodesData.features.find(n => n.properties.node_id === routePath[i]);
        const endNode = nodesData.features.find(n => n.properties.node_id === routePath[i + 1]);
        
        if (startNode && endNode) {
            const startFloor = nodeFloorMap[startNode.properties.node_id] ?? startNode.properties.floor;
            const endFloor = nodeFloorMap[endNode.properties.node_id] ?? endNode.properties.floor;
            
            // フロアフィルタリング
            if (floor !== null) {
                // 両端が同じ階層の場合のみ表示
                if (startFloor !== floor || endFloor !== floor) continue;
            }
            
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
                    start_id: routePath[i],
                    end_id: routePath[i + 1]
                }
            });
        }
    }
    
    // 既存のレイヤーを削除
    map.removeLayer('route-layer');
    
    // 新しいレイヤーを追加
    const newRouteLayer = new MapboxLayer({
        id: 'route-layer',
        type: deck.GeoJsonLayer,
        data: {
            type: 'FeatureCollection',
            features: routeFeatures
        },
        pickable: false,
        lineWidthMinPixels: 5,
        lineWidthMaxPixels: 8,
        getLineColor: [239, 68, 68, 255],
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
                        let startZ, endZ;
                        if (isFloorPlanView && floor !== null) {
                            startZ = FLOOR_PLAN_ROUTE_Z;
                            endZ = FLOOR_PLAN_ROUTE_Z;
                        } else {
                            startZ = (config.floorOffsets[String(startFloor)] ?? 0) + LINK_Z_OFFSET + 0.2;
                            endZ = (config.floorOffsets[String(endFloor)] ?? 0) + LINK_Z_OFFSET + 0.2;
                        }
                        f.geometry.coordinates = [
                            [coords[0][0], coords[0][1], startZ],
                            [coords[1][0], coords[1][1], endZ]
                        ];
                    }
                }
            });
            return data;
        }
    });
    map.addLayer(newRouteLayer);
}

/**
 * 経路表示時に経路が通る階層を取得
 */
function getRouteFloors() {
    if (!routePath || routePath.length === 0) return [];
    
    const floors = new Set();
    routePath.forEach(nodeId => {
        const node = nodesData.features.find(n => n.properties.node_id === nodeId);
        if (node) {
            const floor = nodeFloorMap[nodeId] ?? node.properties.floor;
            floors.add(floor);
        }
    });
    
    return Array.from(floors).sort((a, b) => b - a);
}
