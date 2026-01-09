// ============================================================================
// 設備関連機能
// ============================================================================

/**
 * Facilityカテゴリ名を取得
 */
function getFacilityCategoryName(category) {
    if (!category) return category || '不明';

    // カテゴリーデータから取得
    if (categoryData && categoryData.facility) {
        if (categoryData.facility[category]) {
            return categoryData.facility[category].ja;
        } else {
            // カテゴリーが見つからない場合はコードを返す
            console.warn(`Facilityカテゴリー "${category}" が見つかりません`);
            return category;
        }
    }

    // フォールバック: カテゴリーデータが読み込まれていない場合
    console.warn('カテゴリーデータが読み込まれていません');
    return category;
}

/**
 * 設備一覧を表示する関数
 */
function showFacilityList() {
    const panel = document.getElementById('facility-list-panel');
    const content = document.getElementById('facility-list-content');

    if (!panel || !content) return;

    // 設備を階層ごとに整理
    const facilitiesByFloor = {};

    for (const floorId in facilitiesData) {
        if (!facilitiesData[floorId] || !facilitiesData[floorId].features) continue;

        const floorConfig = config.floors.find(f => f.id === floorId);
        if (!floorConfig) continue;

        const floorName = stationLogic.getFloorName(floorConfig.nodeFloor);
        const floorKey = `${floorConfig.nodeFloor}_${floorId}`;

        if (!facilitiesByFloor[floorKey]) {
            facilitiesByFloor[floorKey] = {
                floorName: floorName,
                floorOrdinal: floorConfig.nodeFloor,
                facilities: []
            };
        }

        facilitiesData[floorId].features.forEach(facility => {
            facilitiesByFloor[floorKey].facilities.push({
                ...facility,
                _floorId: floorId
            });
        });
    }

    // 階層順にソート（上から下へ）
    const sortedFloors = Object.keys(facilitiesByFloor).sort((a, b) => {
        return facilitiesByFloor[b].floorOrdinal - facilitiesByFloor[a].floorOrdinal;
    });

    let html = '';

    sortedFloors.forEach(floorKey => {
        const floorData = facilitiesByFloor[floorKey];
        html += `<div class="facility-list-floor">`;
        html += `<div class="facility-list-floor-title">${floorData.floorName} (${floorData.facilities.length}件)</div>`;

        // カテゴリごとにグループ化
        const facilitiesByCategory = {};
        floorData.facilities.forEach(facility => {
            const category = facility.properties.category || 'その他';
            if (!facilitiesByCategory[category]) {
                facilitiesByCategory[category] = [];
            }
            facilitiesByCategory[category].push(facility);
        });

        // カテゴリごとに表示
        Object.keys(facilitiesByCategory).sort().forEach(category => {
            facilitiesByCategory[category].forEach(facility => {
                const categoryName = getFacilityCategoryName(category);
                const name = facility.properties.name && facility.properties.name.trim() !== ''
                    ? facility.properties.name.trim()
                    : '';

                html += `<div class="facility-list-item" data-facility-id="${facility.properties.id}" data-floor-id="${facility._floorId}">`;
                html += `<div class="facility-list-item-category">${categoryName}</div>`;
                if (name) {
                    html += `<div class="facility-list-item-name">${name}</div>`;
                }
                html += `</div>`;
            });
        });

        html += `</div>`;
    });

    content.innerHTML = html;

    // スクロール位置を一番上にリセット
    content.scrollTop = 0;

    // クリックイベントを設定
    content.querySelectorAll('.facility-list-item').forEach(item => {
        item.addEventListener('click', () => {
            const facilityId = item.dataset.facilityId;
            const floorId = item.dataset.floorId;
            focusOnFacility(facilityId, floorId);
        });
    });

    panel.style.display = 'flex';
}

/**
 * 設備にフォーカスする関数
 */
function focusOnFacility(facilityId, floorId) {
    if (!map) {
        console.warn('マップが初期化されていません');
        return;
    }

    if (!facilitiesData[floorId]) {
        console.warn('設備データが見つかりません:', floorId);
        return;
    }

    const facility = facilitiesData[floorId].features.find(f => f.properties.id === facilityId);
    if (!facility) {
        console.warn('設備が見つかりません:', facilityId);
        return;
    }

    // 設備の座標を取得（元の2D座標を使用）
    // facility.geometry.coordinatesは必ず2D座標（[lng, lat]）
    const coords = facility.geometry.coordinates;

    // 座標が配列でない場合や、長さが2未満の場合はエラー
    if (!Array.isArray(coords) || coords.length < 2) {
        console.error('設備の座標が不正です:', coords);
        return;
    }

    // 元の2D座標を取得（必ず最初の2要素を使用）
    // 設備レイヤーで使用されている座標と同じものを使用
    let lng = coords[0];
    let lat = coords[1];

    // 座標の検証
    if (typeof lng !== 'number' || typeof lat !== 'number' || isNaN(lng) || isNaN(lat)) {
        console.error('設備の座標が数値ではありません:', { lng, lat, coords });
        return;
    }

    // 座標の範囲を検証（日本国内の座標範囲）
    if (lng < 120 || lng > 150 || lat < 20 || lat > 50) {
        console.warn('設備の座標が異常な範囲です:', { lng, lat, coords });
    }

    console.log('設備にフォーカス:', facilityId, '座標:', [lng, lat], '元の座標配列:', coords, '座標の長さ:', coords.length);

    // 階層を特定（floor_idから正確に取得）
    let facilityFloor = null;

    // まず、floorsDataからfloor_idが一致するFloorを探す
    for (const fId in floorsData) {
        const floorData = floorsData[fId];
        if (floorData.properties && floorData.properties.id === facility.properties.floor_id) {
            const ordinal = parseFloat(floorData.properties.ordinal);
            if (!isNaN(ordinal)) {
                facilityFloor = ordinal;
                console.log('floorsDataから階層を取得:', facilityFloor, 'from floorId:', fId);
                break;
            }
        }
    }

    // floorsDataで見つからない場合、configから階層を探す
    if (facilityFloor === null) {
        // floorId（config.floorsのid）から直接階層を取得
        const floorConfig = config.floors.find(f => f.id === floorId);
        if (floorConfig) {
            facilityFloor = floorConfig.nodeFloor;
            console.log('configから階層を取得:', facilityFloor, 'from floorId:', floorId);
        } else {
            console.warn('階層が見つかりません。floorId:', floorId, 'floor_id:', facility.properties.floor_id);
        }
    }

    console.log('階層:', facilityFloor, 'floorId:', floorId);

    // ----------------------------------------------------------------
    // [修正] 高度を考慮したターゲット座標の補正計算
    // ----------------------------------------------------------------

    // 1. 設備の実際の高さ(Z)を計算
    //    Spaceレイヤー設定と同じ計算式: offset + SPACE_HEIGHT + 0.5 (Facilityの浮き分)
    const zOffset = config.floorOffsets[String(facilityFloor)] ?? 0;
    const objectHeight = zOffset + SPACE_HEIGHT + 0.5;

    // 2. 現在のカメラ設定を取得
    const currentZoom = map.getZoom();
    const currentPitch = map.getPitch();
    const currentBearing = map.getBearing();

    // ズームレベルを適切に設定
    const targetZoom = 18.5;

    // 3. ピッチと高さに基づいて、ターゲット中心をどれだけずらすか(メートル)計算
    //    カメラが地面(Z=0)を見ている時、高さHの物体を中央にするには、
    //    視線方向に H * tan(pitch) だけ奥の地面を見る必要がある
    const pitchRad = currentPitch * Math.PI / 180;
    const bearingRad = currentBearing * Math.PI / 180;

    // tan(90度)は無限大になるため、ピッチに上限キャップを設ける(通常MapLibreは85度まで)
    const safePitchRad = Math.min(pitchRad, 85 * Math.PI / 180);
    const offsetDistance = objectHeight * Math.tan(safePitchRad);

    // 4. メートル単位のオフセットを経緯度（ラジアン→度）に変換して加算
    //    地球の半径 R ≒ 6378137m
    const R = 6378137;

    // Bearing（向き）の方向にずらす
    // 緯度方向の移動量: dist * cos(bearing)
    const dLat = (offsetDistance * Math.cos(bearingRad)) / R * (180 / Math.PI);
    // 経度方向の移動量: dist * sin(bearing) / cos(lat)
    const dLng = (offsetDistance * Math.sin(bearingRad)) / (R * Math.cos(lat * Math.PI / 180)) * (180 / Math.PI);

    const targetLng = lng + dLng;
    const targetLat = lat + dLat;

    // ----------------------------------------------------------------

    // ハイライト表示
    highlightFacility(facility, facilityFloor, floorId);

    console.log(`設備フォーカス: 元座標[${lng}, ${lat}] -> 補正座標[${targetLng}, ${targetLat}] (高度:${objectHeight}m)`);

    // マップ移動（補正後の座標を中心にする）
    map.flyTo({
        center: [targetLng, targetLat], // 補正済みの座標
        zoom: targetZoom,
        pitch: currentPitch,
        bearing: currentBearing,
        duration: 1500,
        essential: true
    });
}

/**
 * 設備をハイライト表示する関数
 */
function highlightFacility(facility, facilityFloor, floorId) {
    if (!map) {
        console.warn('highlightFacility: マップが初期化されていません');
        return;
    }

    highlightedFacility = facility;

    const z = config.floorOffsets[String(facilityFloor)] ?? 0;
    const coords = facility.geometry.coordinates;

    const highlightedFeature = {
        type: 'Feature',
        geometry: {
            type: 'Point',
            coordinates: [coords[0], coords[1], z + SPACE_HEIGHT + 0.5]
        },
        properties: {
            ...facility.properties
        }
    };

    console.log('ハイライト表示:', highlightedFeature);

    // 既存のレイヤーを削除
    const currentLayer = map.getLayer('highlighted-facility-layer');
    if (currentLayer) {
        map.removeLayer('highlighted-facility-layer');
    }

    // 新しいハイライトレイヤーを作成（赤丸で囲う）
    const MapboxLayer = deck.MapboxLayer || window.MapboxLayer;
    const newHighlightedLayer = new MapboxLayer({
        id: 'highlighted-facility-layer',
        type: deck.GeoJsonLayer,
        data: {
            type: 'FeatureCollection',
            features: [highlightedFeature]
        },
        pickable: false,
        getPointRadius: 3.0, // 設備の点より大きい半径
        radiusMinPixels: 10, // 拡大縮小してもサイズが変わらないように固定
        radiusMaxPixels: 10,
        getFillColor: [0, 0, 0, 0], // 塗りつぶしなし（透明）
        stroked: true,
        getLineColor: [239, 68, 68, 255], // 赤色
        lineWidthMinPixels: 3, // 太い赤い枠線
        lineWidthMaxPixels: 3,
        parameters: {
            depthTest: false, // 常に最前面に表示
            depthFunc: 519,
            blend: true,
            blendFunc: [770, 771, 1, 771]
        }
    });

    map.addLayer(newHighlightedLayer);
    highlightedFacilityLayer = newHighlightedLayer;

    // クリアボタンを表示
    const clearBtn = document.getElementById('clear-facility-highlight');
    if (clearBtn) {
        clearBtn.style.display = 'block';
    }

    console.log('ハイライトレイヤーを追加しました');
}

/**
 * 設備のハイライトをクリアする関数
 */
function clearFacilityHighlight() {
    if (!map) return;

    const currentLayer = map.getLayer('highlighted-facility-layer');
    if (currentLayer) {
        map.removeLayer('highlighted-facility-layer');
    }

    // レイヤーを再作成（空のデータで）
    const MapboxLayer = deck.MapboxLayer || window.MapboxLayer;
    highlightedFacilityLayer = new MapboxLayer({
        id: 'highlighted-facility-layer',
        type: deck.GeoJsonLayer,
        data: {
            type: 'FeatureCollection',
            features: []
        },
        pickable: false,
        getPointRadius: 3.0,
        radiusMinPixels: 10,
        radiusMaxPixels: 10,
        getFillColor: [0, 0, 0, 0],
        stroked: true,
        getLineColor: [239, 68, 68, 255],
        lineWidthMinPixels: 3,
        lineWidthMaxPixels: 3,
        parameters: {
            depthTest: false,
            depthFunc: 519,
            blend: true,
            blendFunc: [770, 771, 1, 771]
        }
    });
    map.addLayer(highlightedFacilityLayer);

    highlightedFacility = null;

    // クリアボタンを非表示
    const clearBtn = document.getElementById('clear-facility-highlight');
    if (clearBtn) {
        clearBtn.style.display = 'none';
    }
}

