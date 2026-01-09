// 新宿西口駅専用の設定とロジック
const ShinjukuNishiguchiStation = {
    // ファイル名の検索パターン（新宿西口駅用）
    getSpaceFileName: (filePrefix, floorId) => {
        // 新宿西口駅の命名規則: Shinjuku-nishiguchi_B0.5_Space.geojson, Shinjuku-nishiguchi_B1_Space.geojson
        return `${filePrefix}_${floorId}_Space.geojson`;
    },
    
    // 階層名の表示
    getFloorName: (floor) => {
        if (floor === 0) return '1F';
        if (floor === -0.5) return 'B0.5F';
        if (floor === -1) return 'B1F';
        if (floor === -3) return 'B3F';
        if (floor === -4) return 'B4F';
        return `階数: ${floor}`;
    },
    
    // 階層ごとの色（RGBA配列）
    getFloorColor: (floor) => {
        if (floor === 0) return [251, 113, 133, 255];      // ローズ (1F)
        if (floor === -0.5) return [251, 191, 36, 255];   // アンバーイエロー (B0.5)
        if (floor === -1) return [56, 189, 248, 255];      // スカイ (B1)
        if (floor === -3) return [168, 85, 247, 255];     // パープル (B3)
        if (floor === -4) return [245, 158, 11, 255];     // アンバー (B4)
        return [251, 191, 36, 255]; // デフォルト: アンバーイエロー
    }
};

