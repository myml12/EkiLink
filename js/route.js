// ============================================================================
// 経路検索機能
// ============================================================================

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

