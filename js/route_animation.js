// ============================================================================
// 経路アニメーション機能
// ============================================================================

/**
 * 経路アニメーションを再生（改善版：ズーム・カメラアングル調整あり）
 */
function playRouteAnimation() {
    if (!routePath || routePath.length < 2 || !map) {
        return;
    }

    // 改善されたカメラ設定
    const targetZoom = 20; // より大きなズームレベルで見やすく
    const targetPitch = 60; // 適度な角度で経路を見下ろす

    // 経路上の各ノードの座標を取得（元の座標とbearing計算用）
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

            // ノードの実際の高さを計算（補正計算用）
            const zOffset = config.floorOffsets[String(floor)] ?? 0;
            const objectHeight = zOffset + NODE_Z_OFFSET + 1.5;

            routeCoords.push({
                lng: lng,
                lat: lat,
                floor: floor,
                objectHeight: objectHeight,
                nodeId: nodeId
            });
        }
    }

    if (routeCoords.length < 2) {
        return;
    }

    // カメラのbearingを計算する関数
    function calculateBearing(fromLng, fromLat, toLng, toLat) {
        // 2点間の方位角を計算
        // 座標を度からラジアンに変換
        const lat1 = fromLat * Math.PI / 180;
        const lat2 = toLat * Math.PI / 180;
        const dLng = (toLng - fromLng) * Math.PI / 180;
        
        // 方位角を計算
        const y = Math.sin(dLng) * Math.cos(lat2);
        const x = Math.cos(lat1) * Math.sin(lat2) -
                  Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
        const bearing = Math.atan2(y, x) * 180 / Math.PI;
        return (bearing + 360) % 360; // 0-360度に正規化
    }

    // カメラ位置を補正する関数（ピッチとbearingに基づく）
    function adjustCameraPosition(lng, lat, objectHeight, pitch, bearing) {
        // NaNチェック：無効な値の場合は補正なしの座標を返す
        // ただし、lngとlatがNaNの場合は元の座標も無効なので、そのままでは使えない
        if (isNaN(bearing) || isNaN(pitch) || isNaN(objectHeight)) {
            // bearing等が無効な場合は補正なしで返す（lng, latは有効と仮定）
            return { lng: lng, lat: lat };
        }
        
        // 座標の有効性チェック
        if (isNaN(lng) || isNaN(lat)) {
            console.warn('adjustCameraPosition: 無効な座標が渡されました', lng, lat);
            return { lng: 0, lat: 0 }; // フォールバック座標
        }
        
        // 極点近くのチェック（Math.cos(lat)がほぼ0になるのを防ぐ）
        const latCos = Math.cos(lat * Math.PI / 180);
        if (Math.abs(latCos) < 0.000001) {
            // 極点付近では補正なしで座標を返す
            return { lng: lng, lat: lat };
        }
        
        const pitchRad = pitch * Math.PI / 180;
        const bearingRad = bearing * Math.PI / 180;
        const safePitchRad = Math.min(pitchRad, 85 * Math.PI / 180);
        const offsetDistance = objectHeight * Math.tan(safePitchRad);
        const R = 6378137; // 地球の半径（メートル）
        
        const dLat = (offsetDistance * Math.cos(bearingRad)) / R * (180 / Math.PI);
        const dLng = (offsetDistance * Math.sin(bearingRad)) / (R * latCos) * (180 / Math.PI);
        
        return {
            lng: lng + dLng,
            lat: lat + dLat
        };
    }

    // アニメーションの設定
    let currentIndex = 0;
    const duration = 1500; // 各ノード間の移動時間を少し長くして滑らかに

    // 最初のノードへの移動準備
    const firstCoord = routeCoords[0];
    
    // 最初のbearing（第1→第2ノード方向）を計算
    // routeCoordsに2つ以上のノードがあることは既に確認済み
    const secondCoord = routeCoords[1];
    let firstBearing = calculateBearing(
        firstCoord.lng, firstCoord.lat,
        secondCoord.lng, secondCoord.lat
    );
    
    // 座標が同一の場合（NaN対策）は現在のbearingを使用、またはデフォルト値(0度=北)を使用
    if (isNaN(firstBearing)) {
        firstBearing = (map.getBearing() !== null && map.getBearing() !== undefined) ? map.getBearing() : 0;
    }
    
    // 最初のノードの補正座標を計算
    const firstAdjusted = adjustCameraPosition(
        firstCoord.lng,
        firstCoord.lat,
        firstCoord.objectHeight,
        targetPitch,
        firstBearing
    );

    // 最初のノードに移動（ズーム・ピッチ・bearing調整）
    map.flyTo({
        center: [firstAdjusted.lng, firstAdjusted.lat],
        zoom: targetZoom,
        pitch: targetPitch,
        bearing: firstBearing,
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

        const currentCoord = routeCoords[currentIndex];
        
        // 次のノードに向かう方向を計算（bearing）
        let nextBearing;
        if (currentIndex < routeCoords.length - 1) {
            // まだ次のノードがある場合は、その方向を向く
            const nextCoord = routeCoords[currentIndex + 1];
            const calculatedBearing = calculateBearing(
                currentCoord.lng, currentCoord.lat,
                nextCoord.lng, nextCoord.lat
            );
            // 座標が同一の場合（NaN対策）は前回のbearingを維持
            if (isNaN(calculatedBearing)) {
                const currentBearing = map.getBearing();
                nextBearing = (currentBearing !== null && currentBearing !== undefined) ? currentBearing : 0;
            } else {
                nextBearing = calculatedBearing;
            }
        } else {
            // 最後のノードの場合は、前回のbearingを維持
            const currentBearing = map.getBearing();
            nextBearing = (currentBearing !== null && currentBearing !== undefined) ? currentBearing : 0;
        }
        
        // 現在のノードの補正座標を計算
        const adjustedCoord = adjustCameraPosition(
            currentCoord.lng,
            currentCoord.lat,
            currentCoord.objectHeight,
            targetPitch,
            nextBearing
        );

        // 次のノードに移動（カメラの向きを経路に沿って変更）
        map.flyTo({
            center: [adjustedCoord.lng, adjustedCoord.lat],
            zoom: targetZoom,
            pitch: targetPitch,
            bearing: nextBearing,
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

