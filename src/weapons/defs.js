// 무기 목록, 카테고리, 아이콘, 위력 스케일
const I = {
  bomb: '<path d="M10 7.5a6.5 6.5 0 1 0 0.01 0z" fill="currentColor"/><path d="M14.5 6.5l2.5-2.5M17 4l1.5-.5M17 4l.5-1.5M17 4l1.2 1.2" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/>',
  missile: '<path d="M4 20l3-1 9.5-9.5a4 4 0 0 0 1.2-3.9L17 4l-1.6-.7a4 4 0 0 0-3.9 1.2L2 14l3 1 1 3z" fill="currentColor"/><path d="M4 20l-1.5 1.5" stroke="currentColor" stroke-width="1.8"/>',
  cluster: '<circle cx="12" cy="6" r="3.2" fill="currentColor"/><circle cx="5" cy="15" r="2" fill="currentColor"/><circle cx="12" cy="18" r="2" fill="currentColor"/><circle cx="19" cy="15" r="2" fill="currentColor"/><path d="M12 9.5L6 13M12 9.5v6.5M12 9.5L18 13" stroke="currentColor" stroke-width="1.4" stroke-dasharray="1.5 1.5"/>',
  bunker: '<path d="M12 2l3 5v8l-3 3-3-3V7z" fill="currentColor"/><path d="M3 15h5M16 15h5M2 19h20" stroke="currentColor" stroke-width="2"/>',
  carpet: '<path d="M3 6h18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><circle cx="6" cy="12" r="1.8" fill="currentColor"/><circle cx="12" cy="14" r="1.8" fill="currentColor"/><circle cx="18" cy="16" r="1.8" fill="currentColor"/><path d="M3 21h18" stroke="currentColor" stroke-width="1.6"/>',
  railgun: '<path d="M2 12h20" stroke="currentColor" stroke-width="2.6"/><path d="M4 8l4 4-4 4M14 8l4 4-4 4" stroke="currentColor" stroke-width="1.6" fill="none"/>',
  napalm: '<path d="M12 2c2 4 6 6 6 11a6 6 0 0 1-12 0c0-3 2-4 2-7 2 1 3 3 3 5 1-3 0-6 1-9z" fill="currentColor"/>',
  laser: '<path d="M12 2v20" stroke="currentColor" stroke-width="3"/><path d="M5 22h14M8 5l-3-2M16 5l3-2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  meteor: '<circle cx="15" cy="15" r="5" fill="currentColor"/><path d="M3 3l8 8M7 2l6 6M2 7l6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  rod: '<path d="M12 2v15" stroke="currentColor" stroke-width="2.6"/><path d="M12 17l-3 4h6z" fill="currentColor"/><path d="M8 3l1 3M16 3l-1 3" stroke="currentColor" stroke-width="1.4"/>',
  quake: '<path d="M2 13h4l2-6 3 12 3-15 3 11 2-2h3" stroke="currentColor" stroke-width="2" fill="none" stroke-linejoin="round" stroke-linecap="round"/>',
  tornado: '<path d="M3 4h18M5 8h14M7 12h10M9 16h7M11 20h4" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  sinkhole: '<ellipse cx="12" cy="15" rx="9" ry="4" fill="none" stroke="currentColor" stroke-width="2"/><ellipse cx="12" cy="15" rx="5" ry="2" fill="currentColor"/><path d="M8 5l2 4M16 5l-2 4M12 3v5" stroke="currentColor" stroke-width="1.6"/>',
  tsunami: '<path d="M2 18c3 0 4-2 6-2s3 2 6 2 4-2 8-2M2 13c2-6 9-10 15-6-3 0-5 2-4 5 1 2 4 1 5 0" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>',
  blackhole: '<circle cx="12" cy="12" r="4.5" fill="currentColor"/><ellipse cx="12" cy="12" rx="10" ry="3.5" stroke="currentColor" stroke-width="1.8" fill="none" transform="rotate(-20 12 12)"/>',
  antigrav: '<path d="M12 20V6M7 11l5-5 5 5" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round"/><rect x="4" y="19" width="5" height="3" fill="currentColor"/><rect x="15" y="16" width="4" height="3" fill="currentColor"/>',
  ball: '<circle cx="12" cy="14" r="7" fill="currentColor"/><path d="M12 7V2" stroke="currentColor" stroke-width="2"/><circle cx="9.5" cy="12" r="1.6" fill="#0003"/>',
  stomp: '<path d="M5 20c-1-6 1-11 5-14 2-1 4 0 4 2l-1 6c2-1 5 0 6 2l1 4z" fill="currentColor"/><path d="M5 20h16" stroke="currentColor" stroke-width="1.6"/>',
  nuke: '<circle cx="12" cy="12" r="2.2" fill="currentColor"/><path d="M12 9.8L8.6 3.9a7 7 0 0 1 6.8 0zM14 13.1l6.8 0a7 7 0 0 1-3.4 5.9zM10 13.1l-3.4 5.9a7 7 0 0 1-3.4-5.9z" fill="currentColor"/>',
  bomber: '<path d="M2 12l8-1 1-7h2l1 7 8 1v2l-8 1-.5 4 2.5 1.5V22l-4-1-4 1v-1.5L10.5 19 10 15l-8-1z" fill="currentColor"/>',
  icbm: '<path d="M12 1c2 2 3 5 3 8v8l2 3h-3l-2-2-2 2H7l2-3V9c0-3 1-6 3-8z" fill="currentColor"/><path d="M10 22l2 1 2-1" stroke="currentColor" stroke-width="1.4"/>',
  thermobaric: '<circle cx="12" cy="13" r="7.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-dasharray="2 2"/><circle cx="12" cy="13" r="4" fill="currentColor"/><path d="M12 2v4" stroke="currentColor" stroke-width="2"/>',
  cruise: '<path d="M2 14h14l5-2-5-2H2z" fill="currentColor"/><path d="M8 10l3-5h2l-1 5M8 14l3 5h2l-1-5" fill="currentColor"/>',
  drones: '<g fill="currentColor"><rect x="4" y="5" width="4" height="2"/><rect x="16" y="5" width="4" height="2"/><rect x="10" y="13" width="4" height="2"/></g><g stroke="currentColor" stroke-width="1.2"><path d="M2 4h4M6 4h4M14 4h4M18 4h4M8 12h4M12 12h4"/></g><path d="M5 18l2 3M19 18l-2 3M12 19v3" stroke="currentColor" stroke-width="1.4" stroke-dasharray="1.5 1.5"/>',
  naval: '<path d="M2 16h20l-3 4H5z" fill="currentColor"/><path d="M7 16v-4h8v4M10 12V9h3M13 10l8-4" stroke="currentColor" stroke-width="1.8" fill="none"/>',
  asteroid: '<path d="M14 8l3-2 4 2 1 5-3 4-5 1-3-3 1-5z" fill="currentColor"/><path d="M2 2l9 7M5 1l7 6M1 6l8 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
  mothership: '<ellipse cx="12" cy="9" rx="10" ry="3.2" fill="currentColor"/><path d="M8 7a4 3 0 0 1 8 0" fill="currentColor"/><path d="M10 12l-2 10h8l-2-10" fill="currentColor" opacity="0.45"/>',
  solar: '<circle cx="12" cy="4" r="2.5" fill="currentColor"/><ellipse cx="12" cy="11" rx="8" ry="1.8" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M5 12l7 9 7-9" fill="currentColor" opacity="0.5"/>',
  lightning: '<path d="M4 9a5 5 0 0 1 9-3 4 4 0 0 1 7 3z" fill="currentColor"/><path d="M12 10l-3 6h3l-2 6 6-8h-3l2-4z" fill="currentColor"/>',
  volcano: '<path d="M2 21l7-11h6l7 11z" fill="currentColor"/><path d="M10 9c-1-3 1-4 0-7M14 9c1-3-1-4 0-7M12 9V3" stroke="currentColor" stroke-width="1.5" fill="none"/>',
  landslide: '<path d="M2 6l9 4 11 10H2z" fill="currentColor" opacity="0.55"/><circle cx="15" cy="15" r="2.4" fill="currentColor"/><circle cx="9" cy="12" r="1.8" fill="currentColor"/><circle cx="19" cy="19" r="1.5" fill="currentColor"/>',
  iceage: '<path d="M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M9 4l3 2 3-2M9 20l3-2 3 2" stroke="currentColor" stroke-width="1.5" fill="none"/>',
  whitehole: '<circle cx="12" cy="12" r="4.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 1v4M12 19v4M1 12h4M19 12h4M4 4l3 3M17 17l3 3M20 4l-3 3M7 17l-3 3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
  gravflip: '<path d="M7 20V5M3 9l4-4 4 4M17 4v15M13 15l4 4 4-4" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>',
  rewind: '<path d="M11 6L3 12l8 6zM21 6l-8 6 8 6z" fill="currentColor"/>',
  bowling: '<circle cx="11" cy="13" r="8.5" fill="currentColor"/><circle cx="9" cy="9" r="1.3" fill="#0006"/><circle cx="12.5" cy="8.5" r="1.3" fill="#0006"/><circle cx="10.5" cy="12" r="1.3" fill="#0006"/>',
  domino: '<rect x="2" y="9" width="4" height="12" rx="1" fill="currentColor"/><rect x="8" y="7" width="4" height="12" rx="1" fill="currentColor" transform="rotate(18 10 19)"/><rect x="14" y="5" width="4" height="12" rx="1" fill="currentColor" transform="rotate(40 16 17)"/>',
  finger: '<path d="M10 22V8a2 2 0 0 1 4 0v6" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M14 13l2-1a2 2 0 0 1 2.5 2.5L16 20" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round"/>',
  kaiju: '<circle cx="12" cy="5" r="3" fill="currentColor"/><path d="M7 9h10l1 7h-3l-1 6h-4l-1-6H6z" fill="currentColor"/><path d="M7 10l-4 5M17 10l4 5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
  train: '<rect x="3" y="6" width="13" height="10" rx="1.5" fill="currentColor"/><rect x="16" y="9" width="5" height="7" fill="currentColor"/><circle cx="7" cy="18" r="2" fill="currentColor"/><circle cx="13" cy="18" r="2" fill="currentColor"/><path d="M1 21h22" stroke="currentColor" stroke-width="1.5"/>',
  tsar: '<path d="M12 1c3 0 4 2 4 5v8l-4 3-4-3V6c0-3 1-5 4-5z" fill="currentColor"/><path d="M5 18l7 4 7-4" stroke="currentColor" stroke-width="1.8" fill="none"/><path d="M10 7h4" stroke="#0005" stroke-width="2"/>',
  antimatter: '<circle cx="12" cy="12" r="2.6" fill="currentColor"/><ellipse cx="12" cy="12" rx="10" ry="4" fill="none" stroke="currentColor" stroke-width="1.5"/><ellipse cx="12" cy="12" rx="10" ry="4" fill="none" stroke="currentColor" stroke-width="1.5" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="10" ry="4" fill="none" stroke="currentColor" stroke-width="1.5" transform="rotate(-60 12 12)"/>',
};

export const CATEGORIES = [
  { id: 'blast', name: '폭발' },
  { id: 'air', name: '공습' },
  { id: 'sky', name: '하늘' },
  { id: 'nature', name: '자연재해' },
  { id: 'special', name: '특수' },
  { id: 'fun', name: '놀이·괴수' },
  { id: 'nuke', name: '핵' },
];

const CINE = { key: 'cinematic', label: '연출 카메라', global: true };
const REAL = { key: 'realNuke', label: '실감 핵 연출', global: true };

// opt: 무기별 켜고 끄는 옵션 (전역 공유 옵션은 global: true)
export const WEAPONS = [
  { id: 'bomb', cat: 'blast', name: '폭탄', desc: '하늘에서 떨어지는 고폭탄' },
  { id: 'missile', cat: 'blast', name: '미사일', desc: '카메라에서 발사, 빠르고 정확' },
  { id: 'cluster', cat: 'blast', name: '집속탄', desc: '공중에서 터져 자탄 수십 개를 흩뿌림' },
  { id: 'thermobaric', cat: 'blast', name: '열압력탄', desc: '연료 구름이 퍼진 뒤 점화, 길고 넓은 압력파' },
  { id: 'napalm', cat: 'blast', name: '네이팜', desc: '불바다가 번지며 건물이 서서히 무너짐' },
  { id: 'railgun', cat: 'blast', name: '레일건', desc: '카메라 방향으로 건물 여러 채를 일렬 관통' },
  { id: 'carpet', cat: 'air', name: '융단폭격', desc: '드래그한 선을 따라 폭격기 편대가 투하', hold: true },
  { id: 'bunker', cat: 'air', name: '벙커버스터', desc: '지붕을 뚫고 1층에서 폭발, 제자리 붕괴' },
  { id: 'cruise', cat: 'air', name: '순항미사일', desc: '지형을 따라 낮게 날아와 솟구친 뒤 내리꽂힘', opts: [CINE] },
  { id: 'drones', cat: 'air', name: '자폭 드론 떼', desc: '수십 대가 흩어져 높은 건물부터 들이받음', opts: [CINE] },
  { id: 'naval', cat: 'air', name: '함포 사격', desc: '수평선 너머 함대의 일제 사격 3연발', opts: [CINE] },
  { id: 'laser', cat: 'sky', name: '궤도 레이저', desc: '누르고 끌어서 건물을 잘라내기', hold: true },
  { id: 'meteor', cat: 'sky', name: '운석우', desc: '거대 운석과 파편이 쏟아짐' },
  { id: 'rod', cat: 'sky', name: '신의 지팡이', desc: '궤도에서 텅스텐 막대 낙하, 거대 크레이터' },
  { id: 'asteroid', cat: 'sky', name: '소행성 충돌', desc: '대기권을 가르며 떨어져 충돌구와 분출물', opts: [REAL, CINE] },
  { id: 'mothership', cat: 'sky', name: '외계 모선', desc: '하늘을 덮은 모선이 빔을 쏴 충격파로 쓸어버림', opts: [CINE] },
  { id: 'solar', cat: 'sky', name: '태양 렌즈', desc: '거대 렌즈로 햇빛을 모아 태우기 (누르고 끌기)', hold: true },
  { id: 'lightning', cat: 'sky', name: '번개 폭풍', desc: '먹구름 아래 번개가 높은 건물을 연달아 때림' },
  { id: 'quake', cat: 'nature', name: '지진', desc: '저층부부터 무너지는 연쇄 붕괴' },
  { id: 'tornado', cat: 'nature', name: '토네이도', desc: 'EF5 초대형 토네이도, 마우스를 따라감' },
  { id: 'sinkhole', cat: 'nature', name: '싱크홀', desc: '땅이 꺼지며 건물이 통째로 빨려 들어감' },
  { id: 'tsunami', cat: 'nature', name: '쓰나미', desc: '먼 곳에서 거대한 물의 벽이 도시를 쓸고 지나감' },
  { id: 'volcano', cat: 'nature', name: '화산', desc: '땅이 솟아 분화, 용암탄·화쇄류·용암류', opts: [CINE] },
  { id: 'landslide', cat: 'nature', name: '산사태', desc: '비탈 위에서 흙더미와 바위가 쏟아져 내려옴', opts: [CINE] },
  { id: 'iceage', cat: 'nature', name: '빙하기', desc: '모든 것이 얼어붙고 얼어붙은 건물이 산산조각', opts: [CINE] },
  { id: 'blackhole', cat: 'special', name: '블랙홀', desc: '모든 파편을 끌어당겨 삼킴', opts: [{ key: 'absorb', label: '완전 흡수' }] },
  { id: 'whitehole', cat: 'special', name: '화이트홀', desc: '모든 것을 밀어내고 블랙홀이 삼킨 조각을 토해냄', opts: [CINE] },
  { id: 'antigrav', cat: 'special', name: '반중력', desc: '일대가 통째로 떠올랐다가 한꺼번에 내리꽂힘', opts: [CINE] },
  { id: 'gravflip', cat: 'special', name: '중력 반전', desc: '건물이 하늘로 떨어졌다가 중력이 돌아오면 쏟아짐', opts: [CINE] },
  { id: 'rewind', cat: 'special', name: '시간 역행', desc: '부서진 모든 것을 원래대로 되돌림' },
  { id: 'ball', cat: 'fun', name: '철거 철구', desc: '물리로 굴러가며 들이받음' },
  { id: 'bowling', cat: 'fun', name: '거대 볼링공', desc: '건물을 핀처럼 쓰러뜨리기', opts: [CINE] },
  { id: 'domino', cat: 'fun', name: '도미노', desc: '건물을 겨누면 쓰러지며 다음 건물을 연쇄로 넘어뜨림', opts: [CINE] },
  { id: 'finger', cat: 'fun', name: '신의 손가락', desc: '누르면 집어 들고, 끌다가 놓으면 던짐', hold: true },
  { id: 'stomp', cat: 'fun', name: '괴수 발', desc: '거대한 발이 쿵쿵 걸으며 짓밟음' },
  { id: 'kaiju', cat: 'fun', name: '바위 거인', desc: '지평선에서 걸어와 짓밟고 주먹으로 내려침', opts: [CINE] },
  { id: 'train', cat: 'fun', name: '폭주 기차', desc: '위험물 열차가 도시를 관통하다 연쇄 폭발', opts: [CINE] },
  { id: 'nuke', cat: 'nuke', name: '핵폭탄', desc: '바로 떨어지는 핵폭탄 (×1 ≈ 15kt, ×100 ≈ 47Mt)', opts: [REAL, CINE] },
  { id: 'bomber', cat: 'nuke', name: '폭격기 투하', desc: '폭격기가 날아와 투하, 카메라 연출', opts: [REAL, CINE] },
  { id: 'icbm', cat: 'nuke', name: 'ICBM', desc: '사일로에서 발사되는 대륙간 탄도미사일', opts: [{ key: 'mirv', label: '다탄두(MIRV)' }, REAL, CINE] },
  { id: 'tsar', cat: 'nuke', name: '차르 봄바', desc: '낙하산으로 내려오는 초대형 수소폭탄 (×10 ≈ 50Mt)', opts: [REAL, CINE] },
  { id: 'antimatter', cat: 'nuke', name: '반물질 폭탄', desc: '격납이 풀리며 물질이 소멸, 핵의 25배', opts: [REAL, CINE] },
];

export const DEFAULT_OPTS = { realNuke: true, cinematic: true, mirv: false, absorb: false };

export function weaponIcon(id) { return `<svg viewBox="0 0 24 24" width="26" height="26">${I[id]}</svg>`; }

// 위력(1~100) → 크기/세기 배율. 반경은 폭발 상사법칙처럼 위력의 약 1/3제곱
export function powerScale(P) {
  P = Math.max(0.5, Math.min(100, P));
  return {
    P,
    r: 0.75 * P ** 0.38,      // 반경: 1→0.75, 10→1.8, 100→4.3
    v: 0.85 * P ** 0.22,      // 힘(속도): 1→0.85, 10→1.4, 100→2.3
    n: Math.sqrt(P),          // 개수: 1→1, 10→3.2, 100→10
    t: 0.9 + 0.25 * Math.log10(P), // 지속시간: 1→0.9, 10→1.15, 100→1.4
  };
}
// 슬라이더(0~1) ↔ 위력(1~100) 로그 스케일
export const sliderToPower = (s) => Math.round(10 ** (s * 2) * 10) / 10;
export const powerToSlider = (p) => Math.log10(Math.max(1, p)) / 2;
