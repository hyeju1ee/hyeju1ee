// 수박게임 배경: 해수욕장 (단순한 2D 일러스트, 외곽선 없이 둥근 모양과 볼터치)
// 가운데(수박이 놓이는 자리)는 비워 두고, 인물과 소품은 가장자리에 둔다.
const kid = ({x, y, flip = false, hair = "#3A2A28", shirt = "#F5A442", skin = "#FCE0CC", pony = false, armUp = true}) => `
  <g transform="translate(${x} ${y}) scale(${flip ? -1 : 1} 1)">
    <path d="M-22 70 Q-24 30 0 28 Q24 30 22 70 Z" fill="${shirt}"/>
    ${armUp
      ? `<path d="M16 40 Q30 26 34 4" stroke="${shirt}" stroke-width="11" stroke-linecap="round" fill="none"/><circle cx="35" cy="0" r="7" fill="${skin}"/>`
      : `<path d="M16 42 Q28 52 30 62" stroke="${shirt}" stroke-width="11" stroke-linecap="round" fill="none"/><circle cx="31" cy="66" r="6.5" fill="${skin}"/>`}
    <path d="M-16 42 Q-28 54 -28 64" stroke="${shirt}" stroke-width="11" stroke-linecap="round" fill="none"/>
    <circle cx="-28" cy="68" r="6.5" fill="${skin}"/>
    <circle cx="-25" cy="2" r="7" fill="${skin}"/><circle cx="25" cy="2" r="7" fill="${skin}"/>
    <circle cx="0" cy="0" r="26" fill="${skin}"/>
    <path d="M-27 2 Q-30 -30 0 -30 Q30 -30 27 2 Q22 -14 8 -16 Q-2 -6 -14 -12 Q-22 -6 -27 2 Z" fill="${hair}"/>
    ${pony ? `<path d="M22 -14 Q42 -12 36 12 Q30 0 22 -2 Z" fill="${hair}"/>` : ""}
    <path d="M-12 -2 q3 -4 6 0" stroke="#3A2A28" stroke-width="2.4" stroke-linecap="round" fill="none"/>
    <path d="M6 -2 q3 -4 6 0" stroke="#3A2A28" stroke-width="2.4" stroke-linecap="round" fill="none"/>
    <ellipse cx="-15" cy="8" rx="5.5" ry="3.5" fill="#F7A9A0" opacity=".75"/>
    <ellipse cx="15" cy="8" rx="5.5" ry="3.5" fill="#F7A9A0" opacity=".75"/>
    <path d="M-6 9 Q0 17 6 9 Z" fill="#E0584F"/>
  </g>`;

export const BEACH_SVG = `
<svg class="beach-bg" viewBox="0 0 400 640" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
  <defs>
    <linearGradient id="bSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7FCDF2"/><stop offset="1" stop-color="#CFEFFC"/></linearGradient>
    <linearGradient id="bSea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2E9FD8"/><stop offset="1" stop-color="#5CC3EC"/></linearGradient>
    <filter id="bPaper" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="4" result="n"/>
      <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .07 0"/>
      <feComposite in2="SourceGraphic" operator="in"/>
    </filter>
  </defs>

  <!-- 하늘 -->
  <rect width="400" height="300" fill="url(#bSky)"/>
  <g fill="#fff">
    <g opacity=".95"><circle cx="62" cy="96" r="18"/><circle cx="84" cy="86" r="24"/><circle cx="110" cy="96" r="17"/><rect x="58" y="96" width="56" height="16" rx="8"/></g>
    <g opacity=".9"><circle cx="196" cy="58" r="13"/><circle cx="214" cy="50" r="18"/><circle cx="234" cy="58" r="12"/><rect x="192" y="58" width="46" height="12" rx="6"/></g>
  </g>
  <!-- 웃는 해 -->
  <g transform="translate(330 78)">
    <g stroke="#FFC93C" stroke-width="7" stroke-linecap="round">
      <path d="M0 -50 V-40"/><path d="M0 40 V50"/><path d="M-50 0 H-40"/><path d="M40 0 H50"/>
      <path d="M-35 -35 l7 7"/><path d="M28 28 l7 7"/><path d="M-35 35 l7 -7"/><path d="M28 -28 l7 -7"/>
    </g>
    <circle r="32" fill="#FFD84D"/>
    <circle cx="-10" cy="-4" r="3" fill="#6A4630"/><circle cx="10" cy="-4" r="3" fill="#6A4630"/>
    <ellipse cx="-17" cy="7" rx="6" ry="3.5" fill="#FFA98E" opacity=".8"/><ellipse cx="17" cy="7" rx="6" ry="3.5" fill="#FFA98E" opacity=".8"/>
    <path d="M-8 8 Q0 16 8 8" stroke="#6A4630" stroke-width="2.6" stroke-linecap="round" fill="none"/>
  </g>
  <!-- 갈매기 -->
  <g stroke="#5B6B78" stroke-width="3" stroke-linecap="round" fill="none">
    <path d="M150 128 q7 -8 14 0 q7 -8 14 0"/>
    <path d="M250 112 q5 -6 10 0 q5 -6 10 0"/>
  </g>

  <!-- 바다 -->
  <rect y="248" width="400" height="140" fill="url(#bSea)"/>
  <rect y="248" width="400" height="10" fill="#2591CC"/>
  <!-- 멀리 있는 섬 -->
  <path d="M20 252 Q48 226 80 252 Z" fill="#6CC17A"/>
  <path d="M52 236 q2 -16 -2 -26" stroke="#9A6B44" stroke-width="3" fill="none" stroke-linecap="round"/>
  <path d="M50 210 q-12 -2 -18 6 M50 210 q12 -4 18 4 M50 210 q-4 -10 -14 -12 M50 210 q6 -10 16 -10" stroke="#4FAE60" stroke-width="5" fill="none" stroke-linecap="round"/>
  <!-- 돛단배 -->
  <g transform="translate(286 238)">
    <path d="M-16 14 H18 L12 22 H-10 Z" fill="#F07C6C"/>
    <path d="M0 12 V-16 L14 10 Z" fill="#fff"/>
  </g>
  <!-- 물결 -->
  <g stroke="#fff" stroke-width="4" stroke-linecap="round" fill="none" opacity=".75">
    <path d="M30 290 q12 -8 24 0 q12 -8 24 0"/>
    <path d="M300 300 q12 -8 24 0 q12 -8 24 0"/>
    <path d="M150 330 q12 -8 24 0 q12 -8 24 0"/>
    <path d="M330 350 q10 -7 20 0 q10 -7 20 0"/>
  </g>

  <!-- 모래사장 -->
  <path d="M0 380 Q60 362 120 376 T240 372 T400 372 V640 H0 Z" fill="#F6E1A6"/>
  <path d="M0 380 Q60 362 120 376 T240 372 T400 372" stroke="#fff" stroke-width="9" fill="none" opacity=".85" stroke-linecap="round"/>
  <g fill="#E8C985">
    <circle cx="40" cy="430" r="2.5"/><circle cx="120" cy="470" r="2"/><circle cx="260" cy="440" r="2.5"/><circle cx="350" cy="490" r="2"/>
    <circle cx="200" cy="600" r="2.5"/><circle cx="90" cy="610" r="2"/><circle cx="310" cy="610" r="2.5"/>
  </g>

  <!-- 파라솔과 돗자리 -->
  <g transform="translate(330 400)">
    <path d="M-44 92 L40 92 L52 122 L-32 122 Z" fill="#7CC4F0"/>
    <path d="M-30 92 l12 30 M-10 92 l12 30 M10 92 l12 30 M30 92 l12 30" stroke="#fff" stroke-width="6" opacity=".8"/>
    <path d="M0 -6 L6 100" stroke="#A9764E" stroke-width="5" stroke-linecap="round"/>
    <path d="M-52 4 Q0 -64 52 4 Z" fill="#F26B6B"/>
    <path d="M-26 4 Q-14 -44 0 -34 Q-6 -16 -26 4 Z M0 -34 Q14 -44 26 4 Q6 -16 0 -34 Z" fill="#fff"/>
    <path d="M-52 4 q13 9 26 0 q13 9 26 0 q13 9 26 0 q13 9 26 0" fill="#F26B6B"/>
  </g>

  <!-- 비치볼 -->
  <g transform="translate(62 470)">
    <circle r="22" fill="#fff"/>
    <path d="M0 -22 A22 22 0 0 1 21 -6 L0 0 Z" fill="#F26B6B"/>
    <path d="M21 -6 A22 22 0 0 1 8 20 L0 0 Z" fill="#FFD84D"/>
    <path d="M-8 20 A22 22 0 0 1 -21 -6 L0 0 Z" fill="#5BB8EE"/>
    <circle r="4" fill="#fff"/>
  </g>

  <!-- 모래성 -->
  <g transform="translate(300 560)" fill="#EBC77E">
    <rect x="-34" y="0" width="68" height="34" rx="4"/>
    <rect x="-40" y="-18" width="22" height="24" rx="3"/><rect x="18" y="-18" width="22" height="24" rx="3"/>
    <rect x="-12" y="-30" width="24" height="34" rx="3"/>
    <path d="M0 -30 V-46" stroke="#A9764E" stroke-width="2.5"/><path d="M0 -46 L13 -41 L0 -36 Z" fill="#F26B6B"/>
    <rect x="-6" y="16" width="12" height="18" rx="6" fill="#D9AF62"/>
  </g>
  <!-- 불가사리, 조개 -->
  <path transform="translate(200 470) scale(.9)" d="M0 -14 L4 -4 L14 -4 L6 3 L9 13 L0 7 L-9 13 L-6 3 L-14 -4 L-4 -4 Z" fill="#F7A072" stroke="#F7A072" stroke-width="3" stroke-linejoin="round"/>
  <path transform="translate(150 590)" d="M-12 4 Q0 -18 12 4 Z" fill="#F9C9C0"/>

  <!-- 응원하는 아이들 -->
  ${kid({x: 58, y: 548, shirt: "#5BB8EE", armUp: true})}
  ${kid({x: 362, y: 470, flip: true, shirt: "#F5A442", hair: "#4A2E2A", pony: true, armUp: true})}

  <rect width="400" height="640" filter="url(#bPaper)" fill="#000"/>
</svg>`;
