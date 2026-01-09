// 都庁前駅専用の設定とロジック
const TochomaeStation = {
    // ファイル名の検索パターン（都庁前駅用）
    getSpaceFileName: (filePrefix, floorId) => {
        // 都庁前駅の命名規則: Tochomae_1_Space.geojson, Tochomae_B1_Space.geojson
        return `${filePrefix}_${floorId}_Space.geojson`;
    },
    
    // 階層名の表示
    getFloorName: (floor) => {
        if (floor === 1) return '1F';
        if (floor === 0) return '0F';
        if (floor === -1) return 'B1F';
        if (floor === -2) return 'B2F';
        if (floor === -3) return 'B3F';
        return `階数: ${floor}`;
    },
    
    // 階層ごとの色（RGBA配列）
    getFloorColor: (floor) => {
        if (floor === 1) return [251, 113, 133, 255];      // ローズ (1F)
        if (floor === 0) return [255, 255, 255, 255];     // 白 (0F)
        if (floor === -1) return [56, 189, 248, 255];      // スカイ (B1)
        if (floor === -2) return [52, 211, 153, 255];      // エメラルド (B2)
        if (floor === -3) return [168, 85, 247, 255];     // パープル (B3)
        return [251, 191, 36, 255]; // デフォルト: アンバーイエロー
    }
};

