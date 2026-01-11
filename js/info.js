// ============================================================================
// 情報表示機能
// ============================================================================

// スペースハイライトの表示設定
const SPACE_HIGHLIGHT_COLOR = '#38bdf8';      // Sky blue
const SPACE_HIGHLIGHT_WIDTH = 3;              // Border width (px)
const SPACE_HIGHLIGHT_OPACITY = 0.9;          // Opacity
const SPACE_HIGHLIGHT_SOURCE_ID = 'space-highlight-source';
const SPACE_HIGHLIGHT_LAYER_ID = 'space-highlight-layer';
const SPACE_INFO_DISPLAY_DURATION = 3000;     // Display duration (ms)

/**
 * Space情報を右下に表示する関数
 * @param {Object} props - Spaceのproperties
 * @param {Object} [feature=null] - SpaceのGeoJSON feature（ハイライト表示用、省略時はハイライト無効）
 */
function showSpaceInfo(props, feature = null) {
    const panel = document.getElementById('space-info-panel');
    const content = document.getElementById('space-info-content');

    if (!panel || !content) {
        console.warn('空間情報パネルの要素が見つかりません');
        return;
    }

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

    let html = '';

    if (props.category) {
        html += `<div class="space-category">${getCategoryName(props.category)}</div>`;
    }

    // 名称は空白でない場合のみ表示
    if (props.name && props.name.trim() !== '') {
        html += `<div class="space-name">${props.name.trim()}</div>`;
    }

    content.innerHTML = html;

    // ハイライト表示を追加
    if (feature) {
        highlightSpaceFeature(feature);
    }

    // 既存のタイマーをクリア
    if (showSpaceInfo.timeoutId) {
        clearTimeout(showSpaceInfo.timeoutId);
    }

    // 表示アニメーション
    panel.style.display = 'block';
    // 次のフレームでアニメーションを開始
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            panel.classList.add('show');
        });
    });

    // 指定時間後に自動的に非表示
    showSpaceInfo.timeoutId = setTimeout(() => {
        panel.classList.remove('show');
        setTimeout(() => {
            panel.style.display = 'none';
            // ハイライトも削除
            removeSpaceHighlight();
        }, 300);
    }, SPACE_INFO_DISPLAY_DURATION);
}

/**
 * スペースをハイライト表示する関数
 * @param {Object} feature - SpaceのGeoJSON feature
 */
function highlightSpaceFeature(feature) {
    if (!map) return;

    // 既存のハイライトを削除
    removeSpaceHighlight();

    try {
        // 新しいソースを追加
        if (!map.getSource(SPACE_HIGHLIGHT_SOURCE_ID)) {
            map.addSource(SPACE_HIGHLIGHT_SOURCE_ID, {
                type: 'geojson',
                data: {
                    type: 'FeatureCollection',
                    features: [feature]
                }
            });
        }

        // ハイライトレイヤーを追加（枠線のみ）
        if (!map.getLayer(SPACE_HIGHLIGHT_LAYER_ID)) {
            map.addLayer({
                id: SPACE_HIGHLIGHT_LAYER_ID,
                type: 'line',
                source: SPACE_HIGHLIGHT_SOURCE_ID,
                paint: {
                    'line-color': SPACE_HIGHLIGHT_COLOR,
                    'line-width': SPACE_HIGHLIGHT_WIDTH,
                    'line-opacity': SPACE_HIGHLIGHT_OPACITY
                }
            });
        }
    } catch (error) {
        console.warn('スペースハイライトの追加に失敗しました:', error);
    }
}

/**
 * スペースのハイライトを削除する関数
 */
function removeSpaceHighlight() {
    if (!map) return;

    try {
        // レイヤーとソースを削除
        if (map.getLayer(SPACE_HIGHLIGHT_LAYER_ID)) {
            map.removeLayer(SPACE_HIGHLIGHT_LAYER_ID);
        }
        if (map.getSource(SPACE_HIGHLIGHT_SOURCE_ID)) {
            map.removeSource(SPACE_HIGHLIGHT_SOURCE_ID);
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

