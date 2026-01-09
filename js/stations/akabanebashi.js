// 赤羽橋駅専用の設定とロジック
const AkabanebashiStation = {
    // ファイル名の検索パターン（赤羽橋駅用）
    getSpaceFileName: (filePrefix, floorId) => {
        // 赤羽橋駅の命名規則: Akabanebashi_Space_B1.geojson, Akabanebashi_Space_B2.geojson
        return `${filePrefix}_Space_${floorId}.geojson`;
    },
    
    // 階層名の表示
    getFloorName: (floor) => {
        if (floor === 0) return '1F';
        if (floor === -0.5) return 'B0.5F';
        if (floor === -1) return 'B1F';
        if (floor === -1.5) return 'B1.5F';
        if (floor === -2) return 'B2F';
        return `階数: ${floor}`;
    },
    
    // 階層ごとの色（RGBA配列）
    getFloorColor: (floor) => {
        if (floor === 0) return [251, 113, 133, 255];      // ローズ (1F)
        if (floor === -0.5) return [251, 113, 133, 255];  // ローズ (B0.5)
        if (floor === -1) return [56, 189, 248, 255];      // スカイ (B1)
        if (floor === -1.5) return [139, 92, 246, 255];    // バイオレット (B1.5)
        if (floor === -2) return [52, 211, 153, 255];      // エメラルド (B2)
        return [251, 191, 36, 255]; // デフォルト: アンバーイエロー
    }
};

