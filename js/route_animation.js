// ============================================================================
// 経路アニメーション機能
// ============================================================================

/**
 * 経路アニメーションを再生（設備選択時と同じ挙動）
 */
function playRouteAnimation() {
    if (!routePath || routePath.length < 2 || !map) {
        return;
    }

    // 現在のカメラ設定を取得（設備選択時と同じ）
    const currentZoom = map.getZoom();
    const currentPitch = map.getPitch();
    const currentBearing = map.getBearing();
    const targetZoom = 18.7; // 設備選択時と同じズームレベル

    // 経路上の各ノードの座標を取得（設備選択時と同じ補正計算を適用）
    const routeCoords = [];
    for (let i = 0; i < routePath.length; i++) {
        const nodeId = routePath[i];
        const node = nodesData.features.find(n => n.properties.node_id === nodeId);
        if (node) {
            // ノードの階層を取得
            const floor = nodeFloorMap[nodeId] ?? node.properties.floor;

            // 元の2D座標を取得
            const coords = node.properties._originalCoords ||
                (node.geometry.coordinates.length >= 2 ?
                    [node.geometry.coordinates[0], node.geometry.coordinates[1]] :
                    node.geometry.coordinates);

            let lng = coords[0];
            let lat = coords[1];

            // 座標の検証
            if (typeof lng !== 'number' || typeof lat !== 'number' || isNaN(lng) || isNaN(lat)) {
                continue;
            }

            // ----------------------------------------------------------------
            // 設備選択時と同じ補正計算
            // ----------------------------------------------------------------

            // 1. ノードの実際の高さ(Z)を計算
            //    設備の場合は: offset + SPACE_HEIGHT + 0.5
            //    ノードの場合は: offset + NODE_Z_OFFSET + 1.5（人の目の高さ程度）
            const zOffset = config.floorOffsets[String(floor)] ?? 0;
            const objectHeight = zOffset + NODE_Z_OFFSET + 1.5;

            // 2. ピッチと高さに基づいて、ターゲット中心をどれだけずらすか(メートル)計算
            const pitchRad = currentPitch * Math.PI / 180;
            const bearingRad = currentBearing * Math.PI / 180;

            // tan(90度)は無限大になるため、ピッチに上限キャップを設ける
            const safePitchRad = Math.min(pitchRad, 85 * Math.PI / 180);
            const offsetDistance = objectHeight * Math.tan(safePitchRad);

            // 3. メートル単位のオフセットを経緯度（ラジアン→度）に変換して加算
            const R = 6378137; // 地球の半径（メートル）

            // Bearing（向き）の方向にずらす
            const dLat = (offsetDistance * Math.cos(bearingRad)) / R * (180 / Math.PI);
            const dLng = (offsetDistance * Math.sin(bearingRad)) / (R * Math.cos(lat * Math.PI / 180)) * (180 / Math.PI);

            const targetLng = lng + dLng;
            const targetLat = lat + dLat;

            routeCoords.push({
                lng: targetLng, // 補正後の座標
                lat: targetLat, // 補正後の座標
                nodeId: nodeId
            });
        }
    }

    if (routeCoords.length < 2) {
        return;
    }

    // アニメーションの設定
    let currentIndex = 0;
    const duration = 120; // 設備選択時と同じ移動時間

    // 最初のノードに移動（設備選択時と同じ設定）
    const firstCoord = routeCoords[0];
    map.flyTo({
        center: [firstCoord.lng, firstCoord.lat], // 補正済みの座標
        zoom: targetZoom,
        pitch: currentPitch,
        bearing: currentBearing,
        duration: duration,
        essential: true
    });

    // アニメーションを開始
    function animateToNext() {
        currentIndex++;

        if (currentIndex >= routeCoords.length) {
            // アニメーション完了
            return;
        }

        const nextCoord = routeCoords[currentIndex];

        // 次のノードに移動（設備選択時と同じ設定）
        map.flyTo({
            center: [nextCoord.lng, nextCoord.lat], // 補正済みの座標
            zoom: targetZoom,
            pitch: currentPitch,
            bearing: currentBearing,
            duration: duration,
            essential: true
        });

        // 次のアニメーションをスケジュール
        if (currentIndex < routeCoords.length - 1) {
            setTimeout(animateToNext, duration);
        }
    }

    // 最初の移動が完了したらアニメーションを開始
    setTimeout(() => {
        animateToNext();
    }, duration);
}

