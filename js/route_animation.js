// ============================================================================
// 経路アニメーション機能
// 
// 依存: utils.js (getNodeStrokeColor), constants.js (NODE_Z_OFFSET, LINK_Z_OFFSET)
// ============================================================================

// アニメーション定数
const ANIMATION_DURATION_MS = 3000; // アニメーション全体の長さ（ミリ秒）
const DIMMED_OPACITY = 80; // 非アクティブな階層の透明度（0-255、約31%）
const ACTIVE_OPACITY = 255; // アクティブな階層の透明度（0-255、100%）

// アニメーション状態の管理
let animationState = {
    isAnimating: false,
    animationId: null,
    startTime: null,
    routeCoords: [],
    currentSegmentIndex: 0,
    currentAnimationFloor: null // 現在アニメーション中の階層を追跡
};

/**
 * 経路アニメーションを再生（ポイント移動アニメーション）
 */
function playRouteAnimation() {
    if (!routePath || routePath.length < 2 || !map) {
        return;
    }

    // 既存のアニメーションを停止
    stopRouteAnimation();

    // 経路上の各ノードの座標を取得
    const routeCoords = [];
    for (let i = 0; i < routePath.length; i++) {
        const nodeId = routePath[i];
        const node = nodesData.features.find(n => n.properties.node_id === nodeId);
        if (node) {
            const floor = nodeFloorMap[nodeId] ?? node.properties.floor;
            const coords = node.properties._originalCoords ||
                (node.geometry.coordinates.length >= 2 ?
                    [node.geometry.coordinates[0], node.geometry.coordinates[1]] :
                    node.geometry.coordinates);

            if (typeof coords[0] === 'number' && typeof coords[1] === 'number' && 
                !isNaN(coords[0]) && !isNaN(coords[1])) {
                routeCoords.push({
                    lng: coords[0],
                    lat: coords[1],
                    floor: floor,
                    nodeId: nodeId
                });
            }
        }
    }

    if (routeCoords.length < 2) {
        return;
    }

    // アニメーション状態を初期化
    animationState = {
        isAnimating: true,
        animationId: null,
        startTime: null,
        routeCoords: routeCoords,
        currentSegmentIndex: 0,
        duration: ANIMATION_DURATION_MS,
        currentAnimationFloor: routeCoords[0].floor // 最初の階層で初期化
    };

    // 最初の階層で透明度を設定
    updateLayerOpacityForAnimation(routeCoords[0].floor);

    // アニメーションポイントレイヤーを追加
    addAnimationPointLayer();

    // アニメーションを開始
    animationState.startTime = performance.now();
    animatePoint();
}

/**
 * アニメーションポイントレイヤーの設定を作成
 */
function createAnimationPointLayerConfig(pointData) {
    const MapboxLayer = deck.MapboxLayer || window.MapboxLayer;
    return new MapboxLayer({
        id: 'animation-point-layer',
        type: deck.GeoJsonLayer,
        data: pointData,
        pickable: false,
        getPointRadius: 2.5,
        radiusMinPixels: 10,
        radiusMaxPixels: 15,
        getFillColor: [251, 191, 36, 255], // 黄色
        stroked: true,
        getLineColor: [255, 255, 255, 255],
        lineWidthMinPixels: 2,
        lineWidthMaxPixels: 3,
        parameters: {
            depthTest: false,
            blend: true,
            blendFunc: [770, 771, 1, 771]
        }
    });
}

/**
 * アニメーションポイントレイヤーを追加
 */
function addAnimationPointLayer() {
    // 既存のアニメーションポイントレイヤーを削除
    if (map.getLayer('animation-point-layer')) {
        map.removeLayer('animation-point-layer');
    }

    // 初期位置でレイヤーを作成
    const firstCoord = animationState.routeCoords[0];
    const z = config.floorOffsets[String(firstCoord.floor)] ?? 0;
    
    const pointData = {
        type: 'FeatureCollection',
        features: [{
            type: 'Feature',
            geometry: {
                type: 'Point',
                coordinates: [firstCoord.lng, firstCoord.lat, z + 2]
            },
            properties: {
                floor: firstCoord.floor
            }
        }]
    };

    map.addLayer(createAnimationPointLayerConfig(pointData));
}

/**
 * ポイントをアニメーション
 */
function animatePoint() {
    if (!animationState.isAnimating) {
        return;
    }

    const currentTime = performance.now();
    const elapsed = currentTime - animationState.startTime;
    const progress = Math.min(elapsed / animationState.duration, 1);

    // 経路全体に対する進行度から現在位置を計算
    const totalSegments = animationState.routeCoords.length - 1;
    const currentPosition = progress * totalSegments;
    const segmentIndex = Math.floor(currentPosition);
    const segmentProgress = currentPosition - segmentIndex;

    if (segmentIndex >= totalSegments) {
        // アニメーション完了
        stopRouteAnimation();
        return;
    }

    // 現在のセグメントの座標を取得
    const startCoord = animationState.routeCoords[segmentIndex];
    const endCoord = animationState.routeCoords[segmentIndex + 1];

    // 補間された位置を計算
    const lng = startCoord.lng + (endCoord.lng - startCoord.lng) * segmentProgress;
    const lat = startCoord.lat + (endCoord.lat - startCoord.lat) * segmentProgress;
    const floor = startCoord.floor;
    const z = config.floorOffsets[String(floor)] ?? 0;

    // 階層が変わった場合のみレイヤーの透明度を更新（パフォーマンス最適化）
    if (animationState.currentAnimationFloor !== floor) {
        animationState.currentAnimationFloor = floor;
        updateLayerOpacityForAnimation(floor);
    }

    // ポイントレイヤーを更新
    const pointData = {
        type: 'FeatureCollection',
        features: [{
            type: 'Feature',
            geometry: {
                type: 'Point',
                coordinates: [lng, lat, z + 2]
            },
            properties: {
                floor: floor
            }
        }]
    };

    // レイヤーを更新
    // Note: deck.gl MapboxLayer requires layer recreation for data updates.
    // This is necessary for compatibility with the current implementation.
    if (map.getLayer('animation-point-layer')) {
        map.removeLayer('animation-point-layer');
    }

    map.addLayer(createAnimationPointLayerConfig(pointData));

    // 次のフレームをスケジュール
    animationState.animationId = requestAnimationFrame(animatePoint);
}

/**
 * ノードレイヤーを作成（透明度付き）
 */
function createNodeLayer(currentFloor = null) {
    const MapboxLayer = deck.MapboxLayer || window.MapboxLayer;
    return new MapboxLayer({
        id: 'network-node-layer',
        type: deck.GeoJsonLayer,
        data: nodesData,
        pickable: true,
        getPointRadius: 1,
        radiusMinPixels: 6,
        radiusMaxPixels: 10,
        getFillColor: (d) => {
            const floor = nodeFloorMap[d.properties.node_id] ?? d.properties.floor;
            const color = stationLogic.getFloorColor(floor);
            // 現在のアニメーション階層が指定されている場合は透明度を調整
            const opacity = (currentFloor === null || floor === currentFloor) ? ACTIVE_OPACITY : DIMMED_OPACITY;
            return [color[0], color[1], color[2], opacity];
        },
        stroked: true,
        getLineColor: (d) => {
            const floor = nodeFloorMap[d.properties.node_id] ?? d.properties.floor;
            const fillColor = stationLogic.getFloorColor(floor);
            const strokeColor = getNodeStrokeColor(fillColor);
            const opacity = (currentFloor === null || floor === currentFloor) ? ACTIVE_OPACITY : DIMMED_OPACITY;
            return [strokeColor[0], strokeColor[1], strokeColor[2], opacity];
        },
        lineWidthMinPixels: 1,
        lineWidthMaxPixels: 2,
        parameters: {
            depthTest: true,
            depthFunc: 519,
            blend: true,
            blendFunc: [770, 771, 1, 771]
        },
        dataTransform: (data) => {
            data.features.forEach(f => {
                const floor = nodeFloorMap[f.properties.node_id] ?? f.properties.floor;
                const z = config.floorOffsets[String(floor)];
                const coords = f.properties._originalCoords ||
                    (f.geometry.coordinates.length >= 2 ?
                        [f.geometry.coordinates[0], f.geometry.coordinates[1]] :
                        f.geometry.coordinates);
                f.geometry.coordinates = [coords[0], coords[1], z + NODE_Z_OFFSET];
                f.properties._originalCoords = coords;
            });
            return data;
        }
    });
}

/**
 * リンクレイヤーを作成（透明度付き）
 */
function createLinkLayer(currentFloor = null) {
    const MapboxLayer = deck.MapboxLayer || window.MapboxLayer;
    return new MapboxLayer({
        id: 'network-link-layer',
        type: deck.GeoJsonLayer,
        data: linksData,
        pickable: false,
        lineWidthMinPixels: 2,
        lineWidthMaxPixels: 4,
        getLineColor: (d) => {
            // リンクの階層をstart/endから判定
            const startFloor = nodeFloorMap[d.properties.start_id];
            const endFloor = nodeFloorMap[d.properties.end_id];
            // 現在のアニメーション階層が指定されている場合は透明度を調整
            const opacity = (currentFloor === null || startFloor === currentFloor || endFloor === currentFloor) 
                ? ACTIVE_OPACITY : DIMMED_OPACITY;
            return [0, 255, 255, opacity];
        },
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
}

/**
 * アニメーション中に他の階層の透明度を下げる
 */
function updateLayerOpacityForAnimation(currentFloor) {
    // ノードレイヤーの透明度を調整
    const nodeLayer = map.getLayer('network-node-layer');
    if (nodeLayer && nodesData) {
        map.removeLayer('network-node-layer');
        map.addLayer(createNodeLayer(currentFloor), 'space-circle-layer');
    }
    
    // リンクレイヤーの透明度を調整
    const linkLayer = map.getLayer('network-link-layer');
    if (linkLayer && linksData) {
        map.removeLayer('network-link-layer');
        map.addLayer(createLinkLayer(currentFloor), 'space-circle-layer');
    }
}

/**
 * アニメーションを停止
 */
function stopRouteAnimation() {
    if (animationState.animationId) {
        cancelAnimationFrame(animationState.animationId);
    }

    animationState.isAnimating = false;
    animationState.animationId = null;

    // アニメーションポイントレイヤーを削除
    if (map.getLayer('animation-point-layer')) {
        map.removeLayer('animation-point-layer');
    }

    // レイヤーの透明度を元に戻す
    restoreLayerOpacity();
}

/**
 * レイヤーの透明度を元に戻す
 */
function restoreLayerOpacity() {
    // ノードレイヤーを元に戻す
    const nodeLayer = map.getLayer('network-node-layer');
    if (nodeLayer && nodesData) {
        map.removeLayer('network-node-layer');
        map.addLayer(createNodeLayer(null), 'space-circle-layer');
    }
    
    // リンクレイヤーを元に戻す
    const linkLayer = map.getLayer('network-link-layer');
    if (linkLayer && linksData) {
        map.removeLayer('network-link-layer');
        map.addLayer(createLinkLayer(null), 'space-circle-layer');
    }
}

