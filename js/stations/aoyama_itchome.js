// 青山一丁目駅専用の設定とロジック
const AoyamaItchomeStation = {
    // ファイル名の検索パターン（青山一丁目駅用）
    getSpaceFileName: (filePrefix, floorId) => {
        // 青山一丁目駅の命名規則: Aoyama-itchome_Space_1.geojson, Aoyama-itchome_Space_B1.geojson
        return `${filePrefix}_Space_${floorId}.geojson`;
    },
    
    // 階層名の表示
    getFloorName: (floor) => {
        if (floor === 1) return '1F';
        if (floor === 0) return '0F';
        if (floor === -1) return 'B1F';
        if (floor === -3) return 'B3F';
        if (floor === -4) return 'B4F';
        if (floor === -5) return 'B5F';
        return `階数: ${floor}`;
    },
    
    // 階層ごとの色（RGBA配列）
    getFloorColor: (floor) => {
        if (floor === 1) return [251, 113, 133, 255];      // ローズ (1F)
        if (floor === 0) return [255, 255, 255, 255];     // 白 (0F)
        if (floor === -1) return [56, 189, 248, 255];      // スカイ (B1)
        if (floor === -3) return [168, 85, 247, 255];     // パープル (B3)
        if (floor === -4) return [245, 158, 11, 255];     // アンバー (B4)
        if (floor === -5) return [236, 72, 153, 255];     // ピンク (B5)
        return [251, 191, 36, 255]; // デフォルト: アンバーイエロー
    }
};

