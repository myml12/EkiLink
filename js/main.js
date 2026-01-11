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
let routeLayer = null; // 経路表示レイヤー
let selectedNodesLayer = null; // 選択されたノード表示レイヤー

// 選択モード: 'point' | 'facility'
let selectionInputMode = 'point';

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

// 選択モード切り替えのセットアップ
function setupSelectionModeToggle() {
    const modePointBtn = document.getElementById('mode-point');
    const modeFacilityBtn = document.getElementById('mode-facility');

    if (modePointBtn) {
        modePointBtn.addEventListener('click', () => {
            selectionInputMode = 'point';
            modePointBtn.classList.add('active');
            modeFacilityBtn.classList.remove('active');
            // 施設選択パネルを閉じる
            closeFacilitySelectPanel();
        });
    }

    if (modeFacilityBtn) {
        modeFacilityBtn.addEventListener('click', () => {
            selectionInputMode = 'facility';
            modeFacilityBtn.classList.add('active');
            modePointBtn.classList.remove('active');
        });
    }
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
    setupFacilityListToggle();
    setupSelectionModeToggle();
    
    // イベントリスナー
    document.getElementById('station-select').addEventListener('change', (e) => {
        switchStation(e.target.value);
    });

    // 経路検索UIのイベントハンドラ
    document.getElementById('select-start').addEventListener('click', () => {
        if (routeSelectionMode === 'start') {
            routeSelectionMode = null;
            document.getElementById('select-start').classList.remove('active');
            closeFacilitySelectPanel();
        } else {
            routeSelectionMode = 'start';
            document.getElementById('select-start').classList.add('active');
            document.getElementById('select-end').classList.remove('active');
            
            // 施設モードの場合は施設選択パネルを表示
            if (selectionInputMode === 'facility') {
                showFacilitySelectPanel('start');
            } else {
                showToast('マップ上のポイントをタップしてください');
            }
        }
    });

    document.getElementById('select-end').addEventListener('click', () => {
        if (routeSelectionMode === 'end') {
            routeSelectionMode = null;
            document.getElementById('select-end').classList.remove('active');
            closeFacilitySelectPanel();
        } else {
            routeSelectionMode = 'end';
            document.getElementById('select-end').classList.add('active');
            document.getElementById('select-start').classList.remove('active');
            
            // 施設モードの場合は施設選択パネルを表示
            if (selectionInputMode === 'facility') {
                showFacilitySelectPanel('end');
            } else {
                showToast('マップ上のポイントをタップしてください');
            }
        }
    });

    document.getElementById('clear-route').addEventListener('click', () => {
        clearRoute();
        closeFacilitySelectPanel();
    });

    // 経路アニメーション再生ボタンのイベントリスナー
    document.getElementById('play-route-animation').addEventListener('click', () => {
        playRouteAnimation();
    });

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
