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

