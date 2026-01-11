// ============================================================================
// 経路検索機能
// ============================================================================

// 検索モード: 'normal' または 'barrier-free'
let routeSearchMode = 'normal';

/**
 * グラフ構造を構築（NodeとLinkから）
 * @param {boolean} barrierFree - バリアフリー検索用のグラフを構築するか
 * @param {boolean} avoidElevator - 通常検索でエレベーターを回避するか
 */
function buildRouteGraph(barrierFree = false, avoidElevator = false) {
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
        const routeType = link.properties.route_type;

        // バリアフリー検索の場合は階段・エスカレーターを除外
        if (barrierFree) {
            // route_type: 5=エスカレーター, 6=階段
            if (routeType === 5 || routeType === 6) {
                return; // このリンクをスキップ
            }
        }

        // 通常検索でエレベーターを回避（route_type: 4=エレベーター）
        if (avoidElevator && routeType === 4) {
            return; // このリンクをスキップ
        }

        if (nodeCoords[startId] && nodeCoords[endId]) {
            // linkのdistanceプロパティを優先的に使用（存在する場合）
            // 仕様書によると、エレベーターの場合はdistanceが記載されないことがある
            let distance;
            if (link.properties.distance !== undefined && link.properties.distance !== null && link.properties.distance !== '') {
                // linkのdistanceプロパティを使用（メートル単位）
                distance = parseFloat(link.properties.distance);
                if (isNaN(distance)) {
                    // distanceが数値でない場合は計算
                    distance = calculateDistance(
                        nodeCoords[startId][0], nodeCoords[startId][1],
                        nodeCoords[endId][0], nodeCoords[endId][1]
                    );
                }
            } else {
                // distanceプロパティがない場合は座標から計算
                distance = calculateDistance(
                nodeCoords[startId][0], nodeCoords[startId][1],
                nodeCoords[endId][0], nodeCoords[endId][1]
            );
            }

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

/**
 * ノード選択ハンドラ（経路検索用）
 */
function handleRouteNodeSelection(node) {
    const nodeId = node.properties.node_id;
    const floor = nodeFloorMap[nodeId] ?? node.properties.floor;
    const floorName = stationLogic.getFloorName(floor);

    // 位置情報を取得
    const inOutText = node.properties.in_out === 1 ? '屋内' :
        node.properties.in_out === 2 ? '屋外' :
            node.properties.in_out === 3 ? '出入口付近' : '';
    
    const displayText = inOutText ? `${inOutText} (${floorName})` : `ポイント (${floorName})`;

    if (routeSelectionMode === 'start') {
        routeStartNode = nodeId;
        document.getElementById('start-info').textContent = displayText;
        clearSelectionButtonsActive();
        routeSelectionMode = null;
        routeSelectionInputMode = null;
    } else if (routeSelectionMode === 'end') {
        routeEndNode = nodeId;
        document.getElementById('end-info').textContent = displayText;
        clearSelectionButtonsActive();
        routeSelectionMode = null;
        routeSelectionInputMode = null;
    }

    updateSelectedNodesLayer();
    updateRouteSearchButton();
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
        clearSelectionButtonsActive();
        routeSelectionMode = null;
        routeSelectionInputMode = null;
    } else if (routeSelectionMode === 'end') {
        routeEndNode = nodeId;
        document.getElementById('end-info').textContent = `${categoryName} (${floorName})`;
        clearSelectionButtonsActive();
        routeSelectionMode = null;
        routeSelectionInputMode = null;
    }

    updateSelectedNodesLayer();
    updateRouteSearchButton();
}

/**
 * 経路検索を実行する関数
 */
function performRouteSearch() {
    if (!routeStartNode || !routeEndNode) {
        return;
    }

    if (routeStartNode === routeEndNode) {
        return;
    }

    const isBarrierFree = routeSearchMode === 'barrier-free';
    let graph = routeGraph;

    // バリアフリー検索の場合はバリアフリー用のグラフを使用
    if (isBarrierFree) {
        graph = buildRouteGraph(true, false);
    } else {
        // 通常検索の場合はエレベーターを回避したグラフを使用
        graph = buildRouteGraph(false, true);
    }

    if (!graph) {
        return;
    }

    let path = dijkstra(graph, routeStartNode, routeEndNode);
    let fallbackToNormal = false;

    // バリアフリー検索で経路が見つからない場合は通常検索にフォールバック
    if (isBarrierFree && !path) {
        graph = buildRouteGraph(false, false);
        path = dijkstra(graph, routeStartNode, routeEndNode);
        fallbackToNormal = true;
    }

    // 通常検索でエレベーターを回避した場合に経路が見つからない場合は、エレベーターを使用した検索にフォールバック
    if (!isBarrierFree && !path) {
        graph = buildRouteGraph(false, false);
        path = dijkstra(graph, routeStartNode, routeEndNode);
    }

    if (!path) {
        showToast('経路が見つかりませんでした');
        return;
    }

    routePath = path;
    drawRoute(path);

    // 経路検索完了のトーストを表示
    if (fallbackToNormal) {
        showToast('バリアフリー経路が見つかりませんでした。通常経路を表示します。', 5000);
    } else {
        showToast('経路検索完了');
    }

    // 再生ボタンを表示
    const playBtn = document.getElementById('play-route-animation');
    if (playBtn) {
        playBtn.classList.add('show');
    }
}

/**
 * 経路検索ボタンの状態を更新（廃止されたが、互換性のため残す）
 */
function updateRouteSearchButton() {
    // 出発と到着が両方選択されている場合は自動的に経路検索を実行
    if (routeStartNode && routeEndNode) {
        performRouteSearch();
    }
}

/**
 * 選択されたノードレイヤーを更新
 */
function updateSelectedNodesLayer() {
    const selectedFeatures = [];

    const shouldShowOnFloor = (node) => {
        if (!isFloorPlanView || selectedFloor === null) return true;
        const floor = nodeFloorMap[node.properties.node_id] ?? node.properties.floor;
        return floor === selectedFloor;
    };

    if (routeStartNode) {
        const startNode = nodesData.features.find(n => n.properties.node_id === routeStartNode);
        if (startNode && shouldShowOnFloor(startNode)) {
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
        if (endNode && shouldShowOnFloor(endNode)) {
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
            getPointRadius: 1.5,
            radiusMinPixels: 8,
            radiusMaxPixels: 12,
            getFillColor: (d) => {
                // 出発点は緑、到着点は赤
                if (d.properties.type === 'start') {
                    console.log('start');
                    return [34, 197, 94, 255]; // 緑
                } else if (d.properties.type === 'end') {
                    console.log('end');
                    return [239, 68, 68, 255]; // 赤
                }
                return [255, 255, 255, 255];
            },
            stroked: (d) => {
                // 出発点のみ枠線を表示、到着点は枠線なし（外側の赤丸を削除）
                return d.properties.type === 'start';
            },
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

        // 階層別表示中は選択階層のみ経路を表示
        if (typeof updateRouteLayerForFloor === 'function' && isFloorPlanView && selectedFloor !== null) {
            updateRouteLayerForFloor(selectedFloor, MapboxLayer);
        }
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
    routeSelectionInputMode = null;

    document.getElementById('start-info').textContent = '未選択';
    document.getElementById('end-info').textContent = '未選択';
    clearSelectionButtonsActive();
    updateSelectedNodesLayer();

    // 再生ボタンを非表示
    const playBtn = document.getElementById('play-route-animation');
    if (playBtn) {
        playBtn.classList.remove('show');
    }

    // 道案内モーダルを閉じる
    closeNavigationModal();

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

