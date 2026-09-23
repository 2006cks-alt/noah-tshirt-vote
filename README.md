# 노아의 짱큰배 티셔츠 투표 — Vercel + Firebase 버전

Claude 아티팩트에서 포팅한 버전. 순수 정적 사이트(빌드 불필요)라 Vercel에 폴더 그대로 올리면 됩니다.

## 1. Firebase 프로젝트 만들기

1. https://console.firebase.google.com 접속 → **프로젝트 추가**
2. 이름 아무거나 (예: `noah-tshirt-vote`) → Google Analytics는 꺼도 됨 → 만들기

## 2. Firestore Database 켜기

1. 왼쪽 메뉴 **Build → Firestore Database → 데이터베이스 만들기**
2. 위치는 `asia-northeast3 (서울)` 선택
3. 처음엔 아무 모드로 시작해도 됨 (뒤에서 규칙을 통째로 덮어씀)
4. 만들어지면 **규칙(Rules)** 탭 → 이 프로젝트의 `firestore.rules` 파일 내용을 그대로 복사해서 붙여넣고 **게시**

## 3. 익명 로그인 켜기 (투표 익명성 보장용)

1. **Build → Authentication → 시작하기**
2. **Sign-in method** 탭 → **익명(Anonymous)** → 사용 설정

## 4. 웹 앱 등록하고 설정값 받기

1. 프로젝트 개요(톱니바퀴 옆 홈 아이콘) → **앱 추가 → 웹(</>) 아이콘**
2. 닉네임 아무거나 입력 (Firebase Hosting 체크는 안 해도 됨) → 앱 등록
3. 화면에 나오는 `firebaseConfig = { apiKey: ..., ... }` 객체를 통째로 복사
4. 이 프로젝트의 **`firebase-config.js`** 파일을 열어서, `REPLACE_ME`로 되어 있는 값들을 방금 복사한 값으로 교체하고 저장

## 5. Vercel에 배포

이 컴퓨터에는 Node.js가 없어서 Vercel CLI(`vercel` 명령어)를 제가 직접 돌릴 수는 없어요. 대신 GitHub 경유로 배포하면 됩니다 (빌드 명령 없음, 프레임워크는 "Other"로 자동 인식):

1. GitHub에서 새 저장소 만들기 (Private으로 해도 됨)
2. 이 폴더를 그 저장소에 push (제가 git 커밋까지는 해드릴게요, push는 본인 GitHub 인증으로 해주셔야 해요)
3. https://vercel.com/new 에서 그 저장소 **Import**
4. 빌드 설정 그대로 두고 **Deploy**

## 관리자 접속

- 첫 로그인 화면에서 학번에 `admin`, 이름에 `4474` 입력 → 관리자 페이지
- 또는 `/#admin` 경로로 들어가서 PIN `0925` 입력

## 이미지는 어떻게 올리나요? (Firebase Storage 대신)

Firebase Storage는 Blaze(결제) 요금제가 필요해서 이 프로젝트에서는 쓰지 않아요. 대신 관리자 페이지에서 **이미지 URL을 직접 붙여넣는 방식**이에요:

1. [imgur.com](https://imgur.com) 접속 (계정 가입 없이도 업로드 가능)
2. 이미지를 드래그해서 올리기
3. 올라간 이미지를 우클릭 → "이미지 주소 복사" (직접 링크, `.jpg`/`.png`로 끝나는 주소)
4. 관리자 페이지의 "디자인 추가"에서 그 링크를 붙여넣기

## 참고

- `designs`, `votes`, `voters` 컬렉션은 (Claude 버전과 동일하게) 링크를 가진 누구나 쓸 수 있어요 — 학교/캠프용 소규모 투표라 가정한 신뢰 수준입니다. 더 엄격하게 막고 싶으면 `firestore.rules`를 조정하면 돼요.
- 투표 마감일(`app.js`의 `VOTE_DEADLINE`)은 현재 9/26(토) 23:59로 하드코딩되어 있어요. 날짜를 바꾸려면 그 줄만 수정하면 됩니다.
