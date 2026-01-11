// ============================================================================
// 情報表示機能
// ============================================================================

// スペースハイライトの表示設定
const SPACE_HIGHLIGHT_COLOR = '#38bdf8';      // Sky blue
const SPACE_HIGHLIGHT_WIDTH = 3;              // Border width (px)
const SPACE_HIGHLIGHT_OPACITY = 0.9;          // Opacity
const SPACE_HIGHLIGHT_LAYER_ID = 'space-highlight-layer';

/**
 * Space情報をポップアップ表示する関数
 * @param {Object} props - Spaceのproperties
 * @param {Object} [feature=null] - SpaceのGeoJSON feature（ハイライト表示用、省略時はハイライト無効）
 * @param {Array<number>} [lngLat=null] - クリックされた位置の座標 [経度, 緯度]
 */
function showSpaceInfo(props, feature = null, lngLat = null) {
    // categoryコードの意味を取得（categories.jsonから）
    const getCategoryName = (category) => {
        if (!category) return category;

        // カテゴリーデータから取得
        if (categoryData && categoryData.space && categoryData.space[category]) {
            return categoryData.space[category].ja;
        }

        // フォールバック: カテゴリーデータが読み込まれていない場合
        return category;
    };

    let html = '<div class="space-popup">';
    html += '<h3>空間情報</h3>';

    if (props.category) {
        html += '<div class="info-row">';
        html += '<span class="info-label">種別:</span>';
        html += `<span class="info-value">${getCategoryName(props.category)}</span>`;
        html += '</div>';
    }

    // 名称は空白でない場合のみ表示
    if (props.name && props.name.trim() !== '') {
        html += '<div class="info-row">';
        html += '<span class="info-label">名称:</span>';
        html += `<span class="info-value">${props.name.trim()}</span>`;
        html += '</div>';
    }

    html += '</div>';

    // ハイライト表示を追加
    if (feature) {
        highlightSpaceFeature(feature);
    }

    // ポップアップを表示
    if (lngLat && map) {
        // 既存のポップアップを削除
        if (currentPopup) {
            currentPopup.remove();
        }

        currentPopup = new maplibregl.Popup({
            closeButton: true,
            className: 'space-info-popup',
            offset: [0, -10]
        })
            .setLngLat(lngLat)
            .setHTML(html)
            .addTo(map);

        // ポップアップが閉じられたときにハイライトも削除
        currentPopup.on('close', () => {
            removeSpaceHighlight();
        });
    }
}

/**
 * スペースをハイライト表示する関数
 * @param {Object} feature - SpaceのGeoJSON feature
 */
function highlightSpaceFeature(feature) {
    if (!map || !config) return;

    // 既存のハイライトを削除
    removeSpaceHighlight();

    // クリックされたスペースの階層を特定
    // feature.layer.idから階層IDを抽出 (例: "space-layer-B1F" -> "B1F")
    let floorId = null;
    let floorOffset = 0;
    
    if (feature.layer && feature.layer.id) {
        const match = feature.layer.id.match(/space-layer-(.+)/);
        if (match) {
            floorId = match[1];
            // config.floorsから該当する階層の設定を取得
            const floorConfig = config.floors.find(f => f.id === floorId);
            if (floorConfig) {
                floorOffset = floorConfig.offset;
            }
        }
    }

    try {
        // deck.glを使用して3D空間に正確に配置
        const MapboxLayer = deck.MapboxLayer || window.MapboxLayer;
        
        if (!MapboxLayer) {
            console.warn('deck.gl MapboxLayerが利用できません');
            return;
        }

        // ポリゴンの座標を3D座標に変換
        const highlightFeature = JSON.parse(JSON.stringify(feature)); // Deep copy
        const z = floorOffset + SPACE_HEIGHT / 2; // 階層の中間の高さ
        
        // Polygon/MultiPolygonの座標を3Dに変換
        if (highlightFeature.geometry.type === 'Polygon') {
            highlightFeature.geometry.coordinates = highlightFeature.geometry.coordinates.map(ring =>
                ring.map(coord => [coord[0], coord[1], z])
            );
        } else if (highlightFeature.geometry.type === 'MultiPolygon') {
            highlightFeature.geometry.coordinates = highlightFeature.geometry.coordinates.map(polygon =>
                polygon.map(ring =>
                    ring.map(coord => [coord[0], coord[1], z])
                )
            );
        }

        // deck.glのGeoJsonLayerを使用（3D座標をサポート）
        const highlightLayer = new MapboxLayer({
            id: SPACE_HIGHLIGHT_LAYER_ID,
            type: deck.GeoJsonLayer,
            data: {
                type: 'FeatureCollection',
                features: [highlightFeature]
            },
            pickable: false,
            stroked: true,
            filled: false, // 塗りつぶしなし
            getLineColor: hexToRgb(SPACE_HIGHLIGHT_COLOR),
            getLineWidth: SPACE_HIGHLIGHT_WIDTH,
            lineWidthMinPixels: SPACE_HIGHLIGHT_WIDTH,
            lineWidthMaxPixels: SPACE_HIGHLIGHT_WIDTH * 2,
            parameters: {
                depthTest: true,
                depthFunc: 519, // GL_LEQUAL
                blend: true,
                blendFunc: [770, 771, 1, 771]
            }
        });

        map.addLayer(highlightLayer);
    } catch (error) {
        console.warn('スペースハイライトの追加に失敗しました:', error);
    }
}

/**
 * HEXカラーをRGB配列に変換
 * @param {string} hex - HEXカラーコード (例: "#38bdf8")
 * @returns {Array<number>} RGB配列 [r, g, b, a]
 */
function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? [
        parseInt(result[1], 16),
        parseInt(result[2], 16),
        parseInt(result[3], 16),
        Math.floor(SPACE_HIGHLIGHT_OPACITY * 255)
    ] : [56, 189, 248, 255]; // デフォルト値
}

/**
 * スペースのハイライトを削除する関数
 */
function removeSpaceHighlight() {
    if (!map) return;

    try {
        // deck.glレイヤーを削除
        if (map.getLayer(SPACE_HIGHLIGHT_LAYER_ID)) {
            map.removeLayer(SPACE_HIGHLIGHT_LAYER_ID);
        }
    } catch (error) {
        console.warn('スペースハイライトの削除に失敗しました:', error);
    }
}

/**
 * Facility情報を表示する関数
 * @param {Object} feature - FacilityのGeoJSON feature
 * @param {Array<number>} lngLat - [経度, 緯度] の配列
 */
function showFacilityInfo(feature, lngLat) {
    if (currentPopup) {
        currentPopup.remove();
    }

    const props = feature.properties;
    const categoryName = getFacilityCategoryName(props.category);

    // デバッグ: カテゴリーデータが読み込まれているか確認
    if (!categoryData) {
        console.warn('showFacilityInfo: カテゴリーデータが読み込まれていません');
    } else if (props.category && (!categoryData.facility || !categoryData.facility[props.category])) {
        console.warn('showFacilityInfo: カテゴリーが見つかりません:', props.category, '利用可能なカテゴリー:', Object.keys(categoryData.facility || {}).slice(0, 10));
    }

    // floor_idから階層情報を取得
    let floorName = '不明';
    if (props.floor_id) {
        // floorsDataからfloor_idが一致するFloorを探す
        for (const floorId in floorsData) {
            const floorData = floorsData[floorId];
            if (floorData.properties.id === props.floor_id) {
                // Floorのordinalから階層名を取得
                const ordinal = parseFloat(floorData.properties.ordinal);
                if (!isNaN(ordinal)) {
                    floorName = stationLogic.getFloorName(ordinal);
                } else if (floorData.properties.name) {
                    floorName = floorData.properties.name;
                }
                break;
            }
        }

        // floorsDataで見つからない場合、configから階層を探す
        if (floorName === '不明') {
            // floor_idが一致する階層を探す（簡易的に階層IDを使用）
            const floorConfig = config.floors.find(f => {
                // より正確にはFloorデータを読み込んで確認する必要があるが、簡易的に階層IDを使用
                return true;
            });
            if (floorConfig) {
                floorName = stationLogic.getFloorName(floorConfig.nodeFloor);
            }
        }
    }

    // 改札口や出口の番号を抽出
    const name = props.name && props.name.trim() !== '' ? props.name.trim() : null;
    const number = extractFacilityNumber(name, props.category);

    let html = '<div class="space-popup">';
    html += '<h3>設備情報</h3>';

    if (props.category) {
        html += '<div class="info-row">';
        html += '<span class="info-label">種別:</span>';
        html += `<span class="info-value">${categoryName}</span>`;
        html += '</div>';
    }

    // 番号がある場合は番号を表示、なければ名称を表示
    if (number) {
        html += '<div class="info-row">';
        html += '<span class="info-label">番号:</span>';
        html += `<span class="info-value">${number}</span>`;
        html += '</div>';
    } else if (name) {
        html += '<div class="info-row">';
        html += '<span class="info-label">名称:</span>';
        html += `<span class="info-value">${name}</span>`;
        html += '</div>';
    }

    html += '<div class="info-row">';
    html += '<span class="info-label">階層:</span>';
    html += `<span class="info-value">${floorName}</span>`;
    html += '</div>';

    html += '</div>';

    currentPopup = new maplibregl.Popup({
        closeButton: true,
        className: 'space-info-popup'
    })
        .setLngLat(lngLat)
        .setHTML(html)
        .addTo(map);
}

/**
 * ノード情報を表示する関数
 * @param {Object} feature - ノードのGeoJSON feature
 * @param {Array<number>} lngLat - [経度, 緯度] の配列（ノードの実際の座標）
 */
function showNodeInfo(feature, lngLat) {
    if (currentPopup) {
        currentPopup.remove();
    }

    const props = feature.properties;
    const floor = nodeFloorMap[props.node_id] ?? props.floor;
    // 駅ごとのロジックを使用して階層名を取得
    const floorName = stationLogic.getFloorName(floor);

    // リンク数を計算
    let linkCount = 0;
    for (let i = 1; i <= 8; i++) {
        const linkId = props[`link${i}_id`];
        if (linkId && linkId.trim() !== '') {
            linkCount++;
        }
    }

    let html = '<div class="node-popup">';
    html += '<h3>ポイント情報</h3>';
    
    html += '<div class="info-row">';
    html += '<span class="info-label">階層:</span>';
    html += `<span class="info-value">${floorName}</span>`;
    html += '</div>';
    
    if (props.in_out !== undefined) {
        const inOutText = props.in_out === 1 ? '屋内' :
            props.in_out === 2 ? '屋外' :
                props.in_out === 3 ? '出入口' : '不明';
        html += '<div class="info-row">';
        html += '<span class="info-label">位置:</span>';
        html += `<span class="info-value">${inOutText}</span>`;
        html += '</div>';
    }

    // リンク情報を表示（件数のみ）
    if (linkCount > 0) {
        html += '<div class="info-row">';
        html += '<span class="info-label">接続:</span>';
        html += `<span class="info-value">${linkCount}方向</span>`;
        html += '</div>';
    }

    html += '</div>';

    currentPopup = new maplibregl.Popup({
        closeButton: true,
        closeOnClick: true,
        className: 'node-info-popup',
        offset: [0, -10] // ノードの上に表示
    })
        .setLngLat(lngLat)
        .setHTML(html)
        .addTo(map);
}

