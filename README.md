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
| `src/engine.js` | 헤드리스 게임 엔진 (틱, 함정, 전투, 합성) |
| `src/main.js` | Canvas 렌더링, 터치·드래그 입력, HUD |
| `sw.js` | 오프라인 캐시 (배포 시 `VERSION` 올릴 것) |
| `tools/test.mjs` | 규칙 단위 테스트 |
| `tools/sim.mjs` | 밸런스 시뮬레이터 (`node tools/sim.mjs 40 [weak]`) |

## 배포
GitHub 저장소 Settings → Pages → Source를 **GitHub Actions**로 설정한 뒤 `main`에 push.
