// 東新宿駅専用の設定とロジック
const HigashiShinjukuStation = {
    // ファイル名の検索パターン（東新宿駅用）
    getSpaceFileName: (filePrefix, floorId) => {
        // 東新宿駅の命名規則: Higashi-shinjuku_Space_B1.geojson, Higashi-shinjuku_Space_B2.geojson
        return `${filePrefix}_Space_${floorId}.geojson`;
    },
    
    // 階層名の表示
    getFloorName: (floor) => {
        if (floor === 0) return '1F';
        if (floor === -1) return 'B1F';
        if (floor === -2) return 'B2F';
        if (floor === -3) return 'B3F';
        return `階数: ${floor}`;
    },
    
    // 階層ごとの色（RGBA配列）
    getFloorColor: (floor) => {
        if (floor === 0) return [251, 113, 133, 255];      // ローズ (1F)
        if (floor === -1) return [56, 189, 248, 255];      // スカイ (B1)
        if (floor === -2) return [52, 211, 153, 255];      // エメラルド (B2)
        if (floor === -3) return [168, 85, 247, 255];     // パープル (B3)
        return [251, 191, 36, 255]; // デフォルト: アンバーイエロー
    }
};

