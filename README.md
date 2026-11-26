# Element Slime Defense (챕터 1 MVP)

원소 슬라임 함정 디펜스 PWA. Vanilla JS + Canvas 2D, 외부 라이브러리 없음.

## 실행
```bash
python3 -m http.server 8080   # http://localhost:8080
```
ES Module과 Service Worker 때문에 `file://`로는 실행되지 않습니다.

## 구조
| 파일 | 역할 |
|---|---|
| `src/data.js` | 모든 밸런스 수치 (원소, 족보, 고블린, 라운드 편성) |
| `src/engine.js` | 헤드리스 게임 엔진 (틱, 함정, 전투, 합성, 자동 조합, 무한의 탑) |
| `src/meta.js` | 성장 시스템 (골드·원소 결정·현자의 돌, 강화, 속성 연구, 덱, 환생, 오프라인 보상) |
| `src/main.js` | Canvas 렌더링, 터치·드래그 입력, HUD |
| `sw.js` | 오프라인 캐시 (배포 시 `VERSION` 올릴 것) |
| `tools/test.mjs` | 규칙 단위 테스트 |
| `tools/sim.mjs` | 밸런스 시뮬레이터. 기본값 = **x3 배속, 사람 30APM** (`node tools/sim.mjs 30 [strong\|weak] [챕터] [--speed=3] [--apm=30]`, `--apm=0` 무제한, `--debug` 시간초과 판 출력) |
| `tools/tune.mjs` | 챕터별 목표 승률에 맞는 체력 배율 자동 탐색 |
| `tools/ogre_check.mjs` | 오우거 세기 측정: Lv5 슬라임 N마리 대비 처치율·부순 슬라임 수 |
| `tools/tune_prog.mjs` | 성장형 튜닝: '챕터 N은 강화 L레벨에서 승률 50%'가 되도록 배율 탐색 |
| `tools/progress.mjs` | 성장 시뮬레이터: 자동 모드로 판을 돌리며 강화·연구하는 방치형 플레이어 (`node tools/progress.mjs 30`) |
| `tools/gen_slimes.py` | 슬라임 픽셀아트 생성기 (원소·조합·비밀 족보) |
| `tools/catalog.html` | 캐릭터 도감 (게임 데이터를 읽어 표시) |

## 배포
GitHub 저장소 Settings → Pages → Source를 **GitHub Actions**로 설정한 뒤 `main`에 push.

## 온라인 랭킹 (v2.3.0)

- 닉네임 + 비밀번호 계정, 무한의 탑 TOP 100 랭킹. Firebase Auth·Realtime Database를 SDK 없이 REST로 호출 (`src/online.js`)
- 진행 데이터(골드·강화·덱)는 기존처럼 기기 localStorage에만 저장. 클라우드에는 닉네임·탑 최고 층만 저장
- 보안 규칙: `database.rules.json` → Firebase 콘솔 > Realtime Database > 규칙 탭에 붙여넣고 게시
- 관리: 부적절한 닉네임·기록은 콘솔에서 `ranking/{uid}`, `nicknames/{닉네임}` 삭제, Authentication에서 계정 삭제
