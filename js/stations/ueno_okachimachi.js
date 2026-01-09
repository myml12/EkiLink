// 上野御徒町駅専用の設定とロジック
const UenoOkachimachiStation = {
    // ファイル名の検索パターン（上野御徒町駅用）
    getSpaceFileName: (filePrefix, floorId) => {
        // 上野御徒町駅の命名規則: Ueno-okachimachi_Space_B0.5.geojson, Ueno-okachimachi_Space_B1.geojson
        return `${filePrefix}_Space_${floorId}.geojson`;
    },
    
    // 階層名の表示
    getFloorName: (floor) => {
        if (floor === 0) return '1F';
        if (floor === -0.5) return 'B0.5F';
        if (floor === -1) return 'B1F';
        if (floor === -2) return 'B2F';
        return `階数: ${floor}`;
    },
    
    // 階層ごとの色（RGBA配列）
    getFloorColor: (floor) => {
        if (floor === 0) return [251, 113, 133, 255];      // ローズ (1F)
        if (floor === -0.5) return [251, 191, 36, 255];   // アンバーイエロー (B0.5)
        if (floor === -1) return [56, 189, 248, 255];      // スカイ (B1)
        if (floor === -2) return [52, 211, 153, 255];      // エメラルド (B2)
        return [251, 191, 36, 255]; // デフォルト: アンバーイエロー
    }
};

