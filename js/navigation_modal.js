// ============================================================================
// 道案内モーダルウィンドウ機能
// ============================================================================

/**
 * 経路から道案内ステップを生成
 */
function generateNavigationSteps(path) {
    if (!path || path.length < 2 || !nodesData) {
        return [];
    }

    const steps = [];
    
    // 各ノードの情報を取得
    for (let i = 0; i < path.length; i++) {
        const nodeId = path[i];
        const node = nodesData.features.find(n => n.properties.node_id === nodeId);
        
        if (!node) continue;

        const floor = nodeFloorMap[nodeId] ?? node.properties.floor;
        const floorName = stationLogic ? stationLogic.getFloorName(floor) : `階層 ${floor}`;
        
        // 近くの施設を探す
        const nearbyFacility = findNearestFacilityToNode(nodeId, 20); // 20m以内
        
        // 方向を計算（前のノードから現在のノードへの方向）
        let direction = null;
        let directionIcon = '';
        
        if (i > 0) {
            const prevNode = nodesData.features.find(n => n.properties.node_id === path[i - 1]);
            if (prevNode) {
                direction = calculateDirection(
                    prevNode.geometry.coordinates[0],
                    prevNode.geometry.coordinates[1],
                    node.geometry.coordinates[0],
                    node.geometry.coordinates[1]
                );
                directionIcon = getDirectionIcon(direction);
            }
        }

        // 次のノードとの階層変更をチェック
        let floorChange = null;
        if (i < path.length - 1) {
            const nextNode = nodesData.features.find(n => n.properties.node_id === path[i + 1]);
            if (nextNode) {
                const nextFloor = nodeFloorMap[path[i + 1]] ?? nextNode.properties.floor;
                if (nextFloor !== floor) {
                    const floorDiff = nextFloor - floor;
                    floorChange = {
                        from: floor,
                        to: nextFloor,
                        diff: floorDiff,
                        fromName: floorName,
                        toName: stationLogic ? stationLogic.getFloorName(nextFloor) : `階層 ${nextFloor}`
                    };
                }
            }
        }

        // ステップタイプを決定
        let stepType = 'waypoint';
        if (i === 0) stepType = 'start';
        if (i === path.length - 1) stepType = 'end';

        steps.push({
            index: i,
            nodeId: nodeId,
            type: stepType,
            floor: floor,
            floorName: floorName,
            direction: direction,
            directionIcon: directionIcon,
            nearbyFacility: nearbyFacility,
            floorChange: floorChange,
            coords: node.geometry.coordinates
        });
    }

    return steps;
}

/**
 * 方向を計算（8方向）
 */
function calculateDirection(fromLng, fromLat, toLng, toLat) {
    // Haversine方位角の計算（route_animation.jsと同じアルゴリズム）
    const lat1 = fromLat * Math.PI / 180;
    const lat2 = toLat * Math.PI / 180;
    const dLng = (toLng - fromLng) * Math.PI / 180;
    
    // 方位角を計算
    const y = Math.sin(dLng) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) -
              Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
    let angle = Math.atan2(y, x) * 180 / Math.PI;
    
    // 0-360度に正規化
    angle = (angle + 360) % 360;
    
    // 8方向に分類
    if (angle >= 337.5 || angle < 22.5) return '北';
    if (angle >= 22.5 && angle < 67.5) return '北東';
    if (angle >= 67.5 && angle < 112.5) return '東';
    if (angle >= 112.5 && angle < 157.5) return '南東';
    if (angle >= 157.5 && angle < 202.5) return '南';
    if (angle >= 202.5 && angle < 247.5) return '南西';
    if (angle >= 247.5 && angle < 292.5) return '西';
    if (angle >= 292.5 && angle < 337.5) return '北西';
    
    // すべての角度はカバーされているが、念のため
    return '北';
}

/**
 * 方向アイコンを取得
 */
function getDirectionIcon(direction) {
    const icons = {
        '北': '⬆️',
        '北東': '↗️',
        '東': '➡️',
        '南東': '↘️',
        '南': '⬇️',
        '南西': '↙️',
        '西': '⬅️',
        '北西': '↖️',
        '直進': '⬆️'
    };
    return icons[direction] || '⬆️';
}

/**
 * ノードに最も近い施設を探す
 */
function findNearestFacilityToNode(nodeId, maxDistance = 20) {
    const node = nodesData.features.find(n => n.properties.node_id === nodeId);
    if (!node || !facilitiesData) return null;

    // 依存関数の存在確認（一度だけチェック）
    if (typeof calculateDistance !== 'function') {
        console.warn('calculateDistance関数が利用できません');
        return null;
    }

    const nodeFloor = nodeFloorMap[nodeId] ?? node.properties.floor;
    const nodeCoords = node.geometry.coordinates;

    let nearestFacility = null;
    let minDistance = maxDistance;

    // 同じ階層の施設のみを検索
    for (const floorId in facilitiesData) {
        facilitiesData[floorId].features.forEach(facility => {
            // 階層が一致するかチェック
            const facilityFloor = facility.properties.floor_id;
            
            // floor_idから階層番号を抽出（例: "F01" -> 1）
            let facilityFloorNum = null;
            if (typeof facilityFloor === 'string') {
                const match = facilityFloor.match(/F(\d+)/);
                if (match) {
                    facilityFloorNum = parseInt(match[1], 10);
                }
            } else if (typeof facilityFloor === 'number') {
                facilityFloorNum = facilityFloor;
            }

            if (facilityFloorNum !== nodeFloor) return;

            const facilityCoords = facility.geometry.coordinates;
            const distance = calculateDistance(
                nodeCoords[0], nodeCoords[1],
                facilityCoords[0], facilityCoords[1]
            );

            if (distance < minDistance) {
                minDistance = distance;
                // getFacilityCategoryNameはfacility.jsで定義されている
                const categoryName = typeof getFacilityCategoryName === 'function' 
                    ? getFacilityCategoryName(facility.properties.category)
                    : `施設 ${facility.properties.category}`;
                nearestFacility = {
                    category: categoryName,
                    name: facility.properties.name || '',
                    distance: distance,
                    icon: getFacilityIcon(facility.properties.category)
                };
            }
        });
    }

    return nearestFacility;
}

/**
 * 施設カテゴリに対応するアイコンを取得
 */
function getFacilityIcon(category) {
    const icons = {
        '1': '🚻', // トイレ
        '2': '🚻', // 多目的トイレ
        '3': '🚻', // 男性用トイレ
        '4': '🚻', // 女性用トイレ
        '5': '🚪', // 出入口
        '6': '🏢', // 改札
        '7': '🎫', // 券売機
        '8': '🏧', // ATM
        '9': '❤️', // AED
        '10': '🛗', // エレベーター
        '11': '🪜', // エスカレーター
        '12': '🚶', // 階段
        '13': '♿', // スロープ
        '14': 'ℹ️', // 案内所
        '15': '🛍️', // 売店
        '16': '🍽️', // 飲食店
        '17': '☎️', // 公衆電話
        '18': '🔔', // 呼び出しボタン
        '19': '🪑', // 待合室
        '20': '🚇' // その他
    };
    return icons[category] || '📍';
}

/**
 * 道案内モーダルを表示
 */
function showNavigationModal(path) {
    const modal = document.getElementById('navigation-modal');
    const stepsContainer = document.getElementById('navigation-steps');
    
    if (!modal || !stepsContainer || !path || path.length < 2) {
        return;
    }

    // ナビゲーションステップを生成
    const steps = generateNavigationSteps(path);
    
    if (steps.length === 0) {
        return;
    }

    // HTMLを生成
    let html = '';
    
    // サマリー情報
    const totalSteps = steps.length;
    html += `
        <div class="navigation-summary">
            <div class="navigation-summary-label">経路ステップ数</div>
            <div class="navigation-summary-value">${totalSteps}ステップ</div>
        </div>
    `;

    // 各ステップを生成
    steps.forEach((step, index) => {
        const stepClass = step.type === 'start' ? 'start' : step.type === 'end' ? 'end' : '';
        const stepNumber = step.type === 'start' ? '出発' : step.type === 'end' ? '到着' : `${index}`;
        
        html += `<div class="navigation-step ${stepClass}">`;
        html += `<div class="navigation-step-number">${stepNumber}</div>`;
        html += `<div class="navigation-step-content">`;
        
        // 方向表示
        if (step.type === 'start') {
            html += `<div class="navigation-step-direction">
                <span class="navigation-step-direction-icon">🚀</span>
                出発地点
            </div>`;
        } else if (step.type === 'end') {
            html += `<div class="navigation-step-direction">
                <span class="navigation-step-direction-icon">🎯</span>
                目的地に到着
            </div>`;
        } else if (step.direction) {
            html += `<div class="navigation-step-direction">
                <span class="navigation-step-direction-icon">${step.directionIcon}</span>
                ${step.direction}方向へ進む
            </div>`;
        }

        // 階層情報
        html += `<div class="navigation-step-details">`;
        html += `<span class="navigation-step-floor">${step.floorName}</span>`;
        html += `</div>`;

        // 階層変更情報
        if (step.floorChange) {
            const movementType = step.floorChange.diff > 0 ? '上' : '下';
            const absFloors = Math.abs(step.floorChange.diff);
            html += `<div class="navigation-step-details" style="margin-top: 4px; color: #fbbf24;">
                ⚠️ ${step.floorChange.toName}へ移動（${movementType}へ${absFloors}階層）
            </div>`;
        }

        // 近くの施設情報
        if (step.nearbyFacility) {
            html += `<div class="navigation-step-facility">
                <span class="navigation-step-facility-icon">${step.nearbyFacility.icon}</span>
                <span class="navigation-step-facility-name">
                    ${step.nearbyFacility.category}${step.nearbyFacility.name ? ` (${step.nearbyFacility.name})` : ''}の近く
                </span>
            </div>`;
        }

        html += `</div>`; // navigation-step-content
        html += `</div>`; // navigation-step
    });

    stepsContainer.innerHTML = html;
    modal.style.display = 'flex';
}

/**
 * 道案内モーダルを閉じる
 */
function closeNavigationModal() {
    const modal = document.getElementById('navigation-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

/**
 * 道案内モーダルの初期化
 */
function initNavigationModal() {
    const closeBtn = document.getElementById('close-navigation-modal');
    if (closeBtn) {
        closeBtn.addEventListener('click', closeNavigationModal);
    }
}
