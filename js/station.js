// ============================================================================
// 駅管理
// ============================================================================

/**
 * 利用可能な駅のリストを取得
 */
async function loadAvailableStations() {
    try {
        // stationsディレクトリ内の各ディレクトリをチェック
        // 新しい駅を追加する場合は、このリストに駅IDを追加してください
        const stationsList = [
            'shinjuku', 'yoyogi', 'akabanebashi', 'aoyama_itchome',
            'azabu_juban', 'daimon', 'higaashi_shinjuku', 'kokuritsu_kyogijo',
            'roppongi', 'shinjuku_nishiguchi', 'tochomae', 'ueno_okachimachi'
        ];
        const select = document.getElementById('station-select');
        select.innerHTML = '';

        for (const stationId of stationsList) {
            try {
                const configResponse = await fetch(`./data/stations/${stationId}/config.json`);
                if (configResponse.ok) {
                    const stationConfig = await configResponse.json();
                    const option = document.createElement('option');
                    option.value = stationId;
                    option.textContent = stationConfig.stationName;
                    select.appendChild(option);
                }
            } catch (e) {
                console.warn(`駅 ${stationId} の設定ファイルが見つかりません:`, e);
            }
        }

        // デフォルトで最初の駅を選択
        if (select.options.length > 0) {
            select.value = select.options[0].value;
        } else {
            select.innerHTML = '<option value="">駅データが見つかりません</option>';
        }
    } catch (e) {
        console.error('駅リストの読み込みに失敗しました:', e);
    }
}

/**
 * 駅を切り替える関数
 */
async function switchStation(stationId) {
    if (!stationId) return;

    currentStation = stationId;

    // 設備一覧パネルが開いているかチェック（表示されているかどうか）
    const facilityListPanel = document.getElementById('facility-list-panel');
    const wasFacilityListOpen = facilityListPanel && 
        window.getComputedStyle(facilityListPanel).display !== 'none';

    // 既存のレイヤーとソースを削除
    if (map) {
        // 経路をクリア
        clearRoute();
        // 設備のハイライトをクリア
        clearFacilityHighlight();

        // deck.glレイヤー（MapboxLayer）を削除
        ['network-link-layer', 'network-node-layer', 'route-layer', 'space-circle-layer', 'selected-nodes-layer', 'facility-layer', 'highlighted-facility-layer'].forEach(layerId => {
            try {
                if (map.getLayer(layerId)) {
                    map.removeLayer(layerId);
                }
            } catch (e) {
                console.warn(`[駅切り替え] レイヤー ${layerId} の削除に失敗:`, e);
            }
        });

        // Spaceレイヤーとソースを削除
        const layers = map.getStyle().layers.map(l => l.id);
        layers.forEach(id => {
            if (id !== 'background' && id.startsWith('space-layer-')) {
                try {
                    if (map.getLayer(id)) {
                        map.removeLayer(id);
                    }
                } catch (e) {
                    // エラーは無視（既に削除されている可能性）
                }
            }
        });

        const sources = Object.keys(map.getStyle().sources);
        sources.forEach(id => {
            if (id.startsWith('space-src-')) {
                try {
                    if (map.getSource(id)) {
                        map.removeSource(id);
                    }
                } catch (e) {
                    // エラーは無視（既に削除されている可能性）
                }
            }
        });
    }

    // 設定ファイルを読み込む
    const configResponse = await fetch(`./data/stations/${stationId}/config.json`);
    if (!configResponse.ok) {
        console.error(`駅 ${stationId} の設定ファイルが見つかりません`);
        return;
    }
    config = await configResponse.json();

    // 駅ごとのロジックを設定
    switch (stationId) {
        case 'shinjuku':
            stationLogic = ShinjukuStation;
            break;
        case 'yoyogi':
            stationLogic = YoyogiStation;
            break;
        case 'akabanebashi':
            stationLogic = AkabanebashiStation;
            break;
        case 'aoyama_itchome':
            stationLogic = AoyamaItchomeStation;
            break;
        case 'azabu_juban':
            stationLogic = AzabuJubanStation;
            break;
        case 'daimon':
            stationLogic = DaimonStation;
            break;
        case 'higaashi_shinjuku':
            stationLogic = HigashiShinjukuStation;
            break;
        case 'kokuritsu_kyogijo':
            stationLogic = KokuritsuKyogijoStation;
            break;
        case 'roppongi':
            stationLogic = RoppongiStation;
            break;
        case 'shinjuku_nishiguchi':
            stationLogic = ShinjukuNishiguchiStation;
            break;
        case 'tochomae':
            stationLogic = TochomaeStation;
            break;
        case 'ueno_okachimachi':
            stationLogic = UenoOkachimachiStation;
            break;
        default:
            // デフォルトは新宿駅のロジックを使用（後方互換性）
            stationLogic = ShinjukuStation;
            console.warn(`駅 ${stationId} の専用ロジックが見つかりません。新宿駅のロジックを使用します。`);
    }

    if (!stationLogic) {
        console.error(`[駅切り替え] stationLogicの設定に失敗しました: ${stationId}`);
        return;
    }

    // タイトルを更新
    document.getElementById('station-name').textContent = `${config.stationName} 3Dネットワーク`;
    document.title = `${config.stationName} 3Dネットワーク`;

    // マップを再初期化
    if (map) {
        // 既存のマップがある場合、設定を更新してセットアップを実行
        map.setCenter(config.center);
        map.setZoom(config.zoom);
        map.setPitch(config.pitch);
        map.setBearing(config.bearing);
        await setupMap();
        // 設備一覧パネルが開いていた場合は再表示（スクロール位置もリセットされる）
        if (wasFacilityListOpen && typeof showFacilityList === 'function') {
            showFacilityList();
        }
    } else {
        // 新規にマップを作成
        map = new maplibregl.Map({
            container: 'map',
            style: {
                version: 8,
                sources: {},
                layers: [{
                    id: 'background',
                    type: 'background',
                    paint: { 'background-color': '#0b0f1a' }
                }]
            },
            center: config.center,
            zoom: config.zoom,
            pitch: config.pitch,
            bearing: config.bearing,
            antialias: true
        });

        map.addControl(new maplibregl.NavigationControl(), 'top-right');

        // マップのイベントリスナーを設定
        map.on('click', (e) => {
            // ---------------------------------------------------------------
            // 優先度1: ノードのクリック判定 (deck.gl レイヤー)
            // ---------------------------------------------------------------
            // マップに関連付けられたdeck.glインスタンスを取得
            // MapboxLayerを使用している場合、mapインスタンスに _deck または __deck として保持されています
            const deckInstance = map.__deck || map._deck;

            if (deckInstance) {
                // pickObject: 画面上のピクセル座標(x,y)から、そこに描画されているオブジェクトを特定する
                // 経緯度計算を行わないため、3D表示時の視差ズレが一切発生しません
                const pickInfo = deckInstance.pickObject({
                    x: e.point.x,
                    y: e.point.y,
                    radius: 5, // クリック判定の許容誤差(ピクセル)
                    layerIds: ['network-node-layer'] // ノードレイヤーのみを対象にする
                });

                // ノードがクリックされた場合
                if (pickInfo && pickInfo.object) {
                    // 経路検索モードなら選択処理
                    if (routeSelectionMode) {
                        handleRouteNodeSelection(pickInfo.object);
                        return; // 処理完了
                    }

                    // 通常モードなら情報表示
                    const coords = pickInfo.coordinate || pickInfo.object.geometry.coordinates;
                    showNodeInfo(pickInfo.object, coords);
                    return; // ノードをクリックしたら、後ろの床(Facility)の判定はしない
                }
            }

            // ---------------------------------------------------------------
            // 優先度2: Facilityのクリック判定 (deck.gl レイヤー)
            // ---------------------------------------------------------------
            // ノードがクリックされていない場合のみ実行

            if (deckInstance) {
                // pickObjectでFacilityレイヤーをチェック
                const facilityPickInfo = deckInstance.pickObject({
                    x: e.point.x,
                    y: e.point.y,
                    radius: 5,
                    layerIds: ['facility-layer']
                });

                if (facilityPickInfo && facilityPickInfo.object) {
                    // 経路検索モードの場合
                    if (routeSelectionMode) {
                        // Facilityから最も近いノードを探して選択
                        const coords = facilityPickInfo.object.properties._originalCoords ||
                            (facilityPickInfo.object.geometry.coordinates.length >= 2 ?
                                [facilityPickInfo.object.geometry.coordinates[0], facilityPickInfo.object.geometry.coordinates[1]] :
                                facilityPickInfo.object.geometry.coordinates);
                        const nearestNode = findNearestNodeToFacility(coords[0], coords[1]);
                        if (nearestNode) {
                            handleRouteNodeSelection(nearestNode);
                        }
                        return;
                    }

                    // 通常モードの場合 (Facility情報をポップアップ表示)
                    const coords = facilityPickInfo.coordinate ||
                        facilityPickInfo.object.properties._originalCoords ||
                        (facilityPickInfo.object.geometry.coordinates.length >= 2 ?
                            [facilityPickInfo.object.geometry.coordinates[0], facilityPickInfo.object.geometry.coordinates[1]] :
                            facilityPickInfo.object.geometry.coordinates);
                    showFacilityInfo(facilityPickInfo.object, coords);
                    return;
                }
            }

            // ---------------------------------------------------------------
            // 優先度3: Spaceのクリック判定 (MapLibre レイヤー)
            // ---------------------------------------------------------------
            // queryRenderedFeatures: 画面上のピクセル座標からMapLibreレイヤーを特定する
            const features = map.queryRenderedFeatures(e.point, {
                layers: config.floors.map(f => `space-layer-${f.id}`)
            });

            if (features.length > 0) {
                const spaceFeature = features[0];

                // 経路検索モードの場合
                if (routeSelectionMode) {
                    handleRouteFacilitySelection(spaceFeature);
                    return;
                }

                // 通常モードの場合 (右下に小さく軽めに表示)
                showSpaceInfo(spaceFeature.properties);
            }
        });

        // 新規マップの場合はloadイベントを待つ
        map.on('load', async () => {
            await setupMap();
            // 設備一覧パネルが開いていた場合は再表示（スクロール位置もリセットされる）
            if (wasFacilityListOpen && typeof showFacilityList === 'function') {
                showFacilityList();
            }
        });
    }
}

