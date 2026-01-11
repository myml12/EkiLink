// ============================================================================
// 経路アニメーション機能
// ============================================================================

// アニメーション状態の管理
let animationState = {
    isAnimating: false,
    animationId: null,
    startTime: null,
    routeCoords: [],
    currentSegmentIndex: 0
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
        duration: 3000 // 全体で3秒
    };

    // アニメーションポイントレイヤーを追加
    addAnimationPointLayer();

    // アニメーションを開始
    animationState.startTime = performance.now();
    animatePoint();
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

    const MapboxLayer = deck.MapboxLayer || window.MapboxLayer;
    const animationLayer = new MapboxLayer({
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

    map.addLayer(animationLayer);
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

    // 他の階層のノードとラインの透明度を下げる
    updateLayerOpacityForAnimation(floor);

    // レイヤーを更新
    if (map.getLayer('animation-point-layer')) {
        map.removeLayer('animation-point-layer');
    }

    const MapboxLayer = deck.MapboxLayer || window.MapboxLayer;
    const animationLayer = new MapboxLayer({
        id: 'animation-point-layer',
        type: deck.GeoJsonLayer,
        data: pointData,
        pickable: false,
        getPointRadius: 2.5,
        radiusMinPixels: 10,
        radiusMaxPixels: 15,
        getFillColor: [251, 191, 36, 255],
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

    map.addLayer(animationLayer);

    // 次のフレームをスケジュール
    animationState.animationId = requestAnimationFrame(animatePoint);
}

/**
 * アニメーション中に他の階層の透明度を下げる
 */
function updateLayerOpacityForAnimation(currentFloor) {
    // ノードレイヤーの透明度を調整
    const nodesLayer = map.getLayer('nodes-layer');
    if (nodesLayer) {
        // deck.glのレイヤーは直接透明度を変更できないため、
        // データの再作成が必要だが、パフォーマンスの観点から省略
        // 必要に応じて実装可能
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
    // ノードとラインレイヤーの透明度を元に戻す処理
    // 必要に応じて実装
}

