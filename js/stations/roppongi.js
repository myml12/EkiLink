// 六本木駅専用の設定とロジック
const RoppongiStation = {
    // ファイル名の検索パターン（六本木駅用）
    getSpaceFileName: (filePrefix, floorId) => {
        // 六本木駅の命名規則: Roppongi_Space_1.geojson, Roppongi_Space_B1.geojson
        return `${filePrefix}_Space_${floorId}.geojson`;
    },
    
    // 階層名の表示
    getFloorName: (floor) => {
        if (floor === 1) return '1F';
        if (floor === 0) return '0F';
        if (floor === -0.5) return 'B0.5F';
        if (floor === -1) return 'B1F';
        if (floor === -2) return 'B2F';
        if (floor === -4) return 'B4F';
        if (floor === -5) return 'B5F';
        if (floor === -6) return 'B6F';
        if (floor === -7) return 'B7F';
        return `階数: ${floor}`;
    },
    
    // 階層ごとの色（RGBA配列）
    getFloorColor: (floor) => {
        if (floor === 1) return [251, 113, 133, 255];      // ローズ (1F)
        if (floor === 0) return [255, 255, 255, 255];     // 白 (0F)
        if (floor === -0.5) return [251, 191, 36, 255];   // アンバーイエロー (B0.5)
        if (floor === -1) return [56, 189, 248, 255];      // スカイ (B1)
        if (floor === -2) return [52, 211, 153, 255];      // エメラルド (B2)
        if (floor === -4) return [245, 158, 11, 255];     // アンバー (B4)
        if (floor === -5) return [236, 72, 153, 255];     // ピンク (B5)
        if (floor === -6) return [251, 113, 133, 255];     // ローズ (B6)
        if (floor === -7) return [168, 85, 247, 255];     // パープル (B7)
        return [251, 191, 36, 255]; // デフォルト: アンバーイエロー
    }
};

