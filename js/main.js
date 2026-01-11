// ============================================================================
// 駅3Dネットワーク - メインロジック
// ============================================================================

// グローバル変数
let map = null;
let config = null;
let nodesData = null;
let linksData = null;
let facilitiesData = {}; // 階層ごとのFacilityデータ
let floorsData = {}; // 階層ごとのFloorデータ（階層名取得用）
let nodeFloorMap = {};
let nodeSpaceMap = {}; // ノードID -> Space情報（色など）
let currentPopup = null;
let currentStation = null;
let stationLogic = null; // 駅ごとのロジック
let categoryData = null; // カテゴリーデータ（JSONから読み込む）

// 経路検索関連
let routeGraph = null; // グラフ構造 {nodeId: {neighborId: distance, ...}, ...}
let routeStartNode = null; // 出発点のノードID
let routeEndNode = null; // 到着点のノードID
let routePath = null; // 検索された経路（ノードIDの配列）
let routeSelectionMode = null; // 'start' | 'end' | null
let routeSelectionInputMode = null; // 'point' | 'facility' | null - 現在選択中の入力モード
let routeLayer = null; // 経路表示レイヤー
let selectedNodesLayer = null; // 選択されたノード表示レイヤー

// ============================================================================
// 初期化
// ============================================================================

// 設備一覧のトグルボタンのイベントリスナー
function setupFacilityListToggle() {
    const toggleBtn = document.getElementById('toggle-facility-list');
    const closeBtn = document.getElementById('close-facility-list');
    const panel = document.getElementById('facility-list-panel');

    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            if (panel && (panel.style.display === 'none' || !panel.style.display)) {
                showFacilityList();
            } else {
                if (panel) panel.style.display = 'none';
            }
        });
    }

    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            if (panel) {
                panel.style.display = 'none';
            }
        });
    }
}

// 新しい選択ボタンのセットアップ
function setupRouteSelectionButtons() {
    // 出発点 - ポイントから選択
    const selectStartPoint = document.getElementById('select-start-point');
    // 出発点 - 施設から選択
    const selectStartFacility = document.getElementById('select-start-facility');
    // 到着点 - ポイントから選択
    const selectEndPoint = document.getElementById('select-end-point');
    // 到着点 - 施設から選択
    const selectEndFacility = document.getElementById('select-end-facility');

    // すべてのボタンのアクティブ状態をクリア
    function clearAllActiveButtons() {
        [selectStartPoint, selectStartFacility, selectEndPoint, selectEndFacility].forEach(btn => {
            if (btn) btn.classList.remove('active');
        });
    }

    // 出発点 - ポイントから選択
    if (selectStartPoint) {
        selectStartPoint.addEventListener('click', () => {
            if (routeSelectionMode === 'start' && routeSelectionInputMode === 'point') {
                // 選択解除
                routeSelectionMode = null;
                routeSelectionInputMode = null;
                clearAllActiveButtons();
                closeFacilitySelectPanel();
            } else {
                routeSelectionMode = 'start';
                routeSelectionInputMode = 'point';
                clearAllActiveButtons();
                selectStartPoint.classList.add('active');
                closeFacilitySelectPanel();
                showToast('マップ上のポイントをタップしてください');
            }
        });
    }

    // 出発点 - 施設から選択
    if (selectStartFacility) {
        selectStartFacility.addEventListener('click', () => {
            if (routeSelectionMode === 'start' && routeSelectionInputMode === 'facility') {
                // 選択解除
                routeSelectionMode = null;
                routeSelectionInputMode = null;
                clearAllActiveButtons();
                closeFacilitySelectPanel();
            } else {
                routeSelectionMode = 'start';
                routeSelectionInputMode = 'facility';
                clearAllActiveButtons();
                selectStartFacility.classList.add('active');
                showFacilitySelectPanel('start');
            }
        });
    }

    // 到着点 - ポイントから選択
    if (selectEndPoint) {
        selectEndPoint.addEventListener('click', () => {
            if (routeSelectionMode === 'end' && routeSelectionInputMode === 'point') {
                // 選択解除
                routeSelectionMode = null;
                routeSelectionInputMode = null;
                clearAllActiveButtons();
                closeFacilitySelectPanel();
            } else {
                routeSelectionMode = 'end';
                routeSelectionInputMode = 'point';
                clearAllActiveButtons();
                selectEndPoint.classList.add('active');
                closeFacilitySelectPanel();
                showToast('マップ上のポイントをタップしてください');
            }
        });
    }

    // 到着点 - 施設から選択
    if (selectEndFacility) {
        selectEndFacility.addEventListener('click', () => {
            if (routeSelectionMode === 'end' && routeSelectionInputMode === 'facility') {
                // 選択解除
                routeSelectionMode = null;
                routeSelectionInputMode = null;
                clearAllActiveButtons();
                closeFacilitySelectPanel();
            } else {
                routeSelectionMode = 'end';
                routeSelectionInputMode = 'facility';
                clearAllActiveButtons();
                selectEndFacility.classList.add('active');
                showFacilitySelectPanel('end');
            }
        });
    }
}

// 選択ボタンのアクティブ状態をクリアする関数
function clearSelectionButtonsActive() {
    ['select-start-point', 'select-start-facility', 'select-end-point', 'select-end-facility'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.classList.remove('active');
    });
}

// DOMContentLoadedイベントを待ってから初期化
document.addEventListener('DOMContentLoaded', async () => {
    // カテゴリーデータを読み込む
    try {
        const response = await fetch('./data/categories.json');
        if (response.ok) {
            categoryData = await response.json();
            console.log('カテゴリーデータを読み込みました:', {
                facility: Object.keys(categoryData.facility || {}).length,
                space: Object.keys(categoryData.space || {}).length
            });
        } else {
            console.warn('カテゴリーデータの読み込みに失敗しました:', response.status);
        }
    } catch (e) {
        console.error('カテゴリーデータの読み込みエラー:', e);
    }
    
    // フロアプランビューのセットアップ
    if (typeof setupFloorPlanView === 'function') {
        setupFloorPlanView();
    }
    
    setupFacilityListToggle();
    setupRouteSelectionButtons();
    
    // 道案内モーダルの初期化
    // コメントアウト: 道案内モーダルは見にくいため一時的に非表示
    // initNavigationModal();
    
    // イベントリスナー
    document.getElementById('station-select').addEventListener('change', (e) => {
        switchStation(e.target.value);
    });

    document.getElementById('clear-route').addEventListener('click', () => {
        clearRoute();
        closeFacilitySelectPanel();
    });

    // 経路アニメーション再生ボタンのイベントリスナー
    document.getElementById('play-route-animation').addEventListener('click', () => {
        playRouteAnimation();
    });

    // 検索モード変更のイベントリスナー
    const normalTab = document.getElementById('route-mode-normal');
    const barrierFreeTab = document.getElementById('route-mode-barrier-free');
    
    if (normalTab && barrierFreeTab) {
        [normalTab, barrierFreeTab].forEach(tab => {
            tab.addEventListener('click', () => {
                const mode = tab.getAttribute('data-mode');
                
                // タブのアクティブ状態を更新
                normalTab.classList.toggle('active', mode === 'normal');
                barrierFreeTab.classList.toggle('active', mode === 'barrier-free');
                
                // 検索モードを更新
                routeSearchMode = mode;
                
                // 出発点と到着点が両方選択されている場合は自動的に再検索
                if (routeStartNode && routeEndNode) {
                    performRouteSearch();
                }
            });
        });
    }

    // 利用可能な駅を読み込む
    await loadAvailableStations();

    // URLパラメータから駅を取得
    const urlParams = new URLSearchParams(window.location.search);
    const stationParam = urlParams.get('station');
    const select = document.getElementById('station-select');

    if (stationParam && Array.from(select.options).some(opt => opt.value === stationParam)) {
        select.value = stationParam;
    } else if (select.options.length > 0) {
        select.value = select.options[0].value;
    }

    // 初期駅を読み込む
    if (select.value) {
        await switchStation(select.value);
    }
});
