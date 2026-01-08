// 新宿駅専用の設定とロジック
const ShinjukuStation = {
    // ファイル名の検索パターン（新宿駅用）
    getSpaceFileName: (filePrefix, floorId) => {
        // 新宿駅の命名規則: Shinjuku_1_Space.geojson, Shinjuku_B1_Space.geojson
        return `${filePrefix}_${floorId}_Space.geojson`;
    },
    
    // 階層名の表示
    getFloorName: (floor) => {
        if (floor === 1) return '1F';
        if (floor === 0) return '0F';
        if (floor === -1) return 'B1F';
        if (floor === -2) return 'B2F';
        if (floor === -2.5) return 'B2.5F';
        if (floor === -3) return 'B3F';
        if (floor === -4.5) return 'B4.5F';
        if (floor === -6) return 'B6F';
        return `階数: ${floor}`;
    },
    
    // 階層ごとの色（RGBA配列）
    getFloorColor: (floor) => {
        if (floor === 1) return [251, 113, 133, 255];      // ローズ (1F)
        if (floor === 0) return [255, 255, 255, 255];     // 白 (0F)
        if (floor === -1) return [56, 189, 248, 255];      // スカイ (B1)
        if (floor === -2) return [52, 211, 153, 255];      // エメラルド (B2)
        if (floor === -2.5) return [139, 92, 246, 255];   // バイオレット (B2.5)
        if (floor === -3) return [168, 85, 247, 255];     // パープル (B3)
        if (floor === -4.5) return [245, 158, 11, 255];   // アンバー (B4.5)
        if (floor === -6) return [236, 72, 153, 255];     // ピンク (B6)
        return [251, 191, 36, 255]; // デフォルト: アンバーイエロー
    }
};

