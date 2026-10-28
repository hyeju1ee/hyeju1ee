# SUBAC 수박 웹앱

성균관대 지속경영전략학회 SUBAC 학회원용 웹앱입니다. iOS·Android 모두 홈 화면에 설치해서 앱처럼 쓸 수 있어요(PWA).

- **학회지**: Vol.1~7 열람, 목차에서 원하는 쪽으로 바로 이동, AI 목차별 요약
- **짝선짝후**: 활동 기록과 실시간 랭킹
- **수박게임**: 15초 동안 수박 많이 먹기, 한 사람당 최고 기록 하나만 순위에 올라감
- **가입 없음**: 처음 열 때 닉네임과 PIN 4자리만 정하면 끝. 다른 기기에서도 같은 닉네임과 PIN을 넣으면 이어서 쓸 수 있어요.

설정 없이 열면 **데모 모드**(기록이 그 기기에만 저장)로 동작합니다. 학회원끼리 기록을 공유하려면 아래 1~3단계를 진행해 주세요. 모두 무료 요금제로 충분해요.

---

## 1. Firebase 만들기 (실시간 랭킹·게임 기록 저장소, 약 10분)

1. <https://console.firebase.google.com> 에서 **프로젝트 추가** → 이름 예: `subac-app` → Google 애널리틱스는 꺼도 됩니다.
2. 왼쪽 메뉴 **빌드 → Authentication → 시작하기 → 로그인 방법**에서 **익명(Anonymous)** 을 사용 설정합니다.
3. **빌드 → Firestore Database → 데이터베이스 만들기** → 위치 `asia-northeast3 (서울)` → **프로덕션 모드**로 만듭니다.
4. Firestore의 **규칙** 탭에 이 폴더의 `firestore.rules` 내용을 통째로 붙여 넣고 **게시**합니다.
5. **프로젝트 설정(톱니바퀴) → 내 앱 → 웹(</>)** 으로 앱을 등록하면 `firebaseConfig` 값이 나옵니다. 그 값을 `firebase-config.js`에 붙여 넣습니다.

## 2. Vercel에 올리기 (무료 호스팅, 약 5분)

1. 이 폴더를 GitHub 저장소로 올립니다(비공개 저장소도 됩니다).
2. <https://vercel.com> 에 GitHub 계정으로 로그인 → **Add New → Project** → 그 저장소를 **Import** → 설정은 그대로 두고 **Deploy**.
3. 배포가 끝나면 `https://<프로젝트이름>.vercel.app` 주소가 생깁니다. 이 주소를 학회 단톡방에 공유하면 됩니다.

## 3. AI 목차별 요약 켜기 (선택)

AI 요약은 서버에서 Claude API(`claude-opus-5-5`)를 호출합니다. 요약은 보고서마다 한 번 만들어지면 저장돼서 다른 학회원은 다시 만들지 않고 봅니다.

1. <https://platform.claude.com> 에서 API 키를 만듭니다. (쓴 만큼 비용이 나갑니다. 보고서 1편 요약에 대략 100~200원이고, 한 번 만든 요약은 저장돼서 다시 비용이 들지 않아요.)
2. Vercel 프로젝트 → **Settings → Environment Variables**에 두 값을 추가합니다.
   - `ANTHROPIC_API_KEY` = 발급받은 키
   - `FIREBASE_PROJECT_ID` = Firebase 프로젝트 ID (예: `subac-app`)
3. **Deployments → 최신 배포 → Redeploy** 를 누르면 학회지 화면에 'AI로 목차별 요약 보기' 버튼이 나타납니다.

키를 넣지 않으면 AI 버튼만 숨겨지고, 미리 정리된 핵심 요약은 그대로 보입니다.

---

## 학회원 설치 방법

**iPhone (Safari)**
1. 공유받은 주소를 **Safari**로 엽니다. (카카오톡에서 열렸다면 오른쪽 아래 ⋯ → 다른 브라우저로 열기)
2. 아래쪽 **공유 버튼** → **홈 화면에 추가** → **추가**.
3. 홈 화면의 '수박' 아이콘으로 열고, 닉네임과 PIN을 입력합니다.

**Android (Chrome)**
1. 공유받은 주소를 **Chrome**으로 엽니다.
2. 화면 위의 '수박 앱을 홈 화면에 설치하세요' 배너에서 **설치**를 누르거나, 오른쪽 위 ⋮ → **앱 설치**.

> iPhone은 Safari와 홈 화면 앱이 저장 공간을 따로 씁니다. Safari에서 먼저 써 봤다면, 설치한 앱에서도 **같은 닉네임과 PIN**을 넣으면 기록이 이어집니다.

---

## 파일 구성

| 파일 | 내용 |
|---|---|
| `index.html`, `app.js` | 화면과 동작 |
| `backend.js` | Firebase 연결(없으면 데모 모드) |
| `journals.js` | 학회지 목록, 목차, 핵심 요약 |
| `journals/pages/` | 학회지 원문의 모든 쪽을 고화질 이미지(WebP)로 바꾼 것. 휴대폰에서 PDF를 직접 그리면 일부 권의 한글이 깨져서 이 방식을 씀 |
| `journals/pages.json` | 파일별 쪽 수와 쪽 비율 |
| `journals/text.json` | AI 요약에 쓰는 보고서 원문 텍스트 |
| `api/summarize.js` | AI 목차별 요약 서버 함수 |
| `firestore.rules` | 데이터 보안 규칙 |
| `manifest.webmanifest`, `sw.js`, `icons/` | 홈 화면 설치·오프라인 지원 |

새 학회지를 추가하려면 PDF를 쪽 이미지로 바꿔 `journals/pages/<파일이름>/001.webp …`로 넣고, `journals/pages.json`과 `journals.js`에 항목을 추가하면 됩니다.

## 알아둘 점

- 닉네임과 PIN은 학회 내부용 간단 확인 장치입니다. PIN은 4자리라 금융 비밀번호 수준의 보안은 아니에요.
- 학회지 PDF에는 학회원 명단(이메일)이 들어 있습니다. 주소는 학회 안에서만 공유해 주세요.
- 1·2·5권은 PDF에서 글자를 뽑을 수 없어서, AI 요약이 미리 정리한 핵심 요약만 근거로 만들어집니다.

ⓒ 2026. Hyeju Lee. All rights reserved.
