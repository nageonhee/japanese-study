# 일본어 원문 독해 & 공부 (일본어 학습)

일본어 원문 기사 읽기 & 어휘 학습 플랫폼

## 주요 기능

- **기사 등록 & 자동 분석**: 일본어 기사를 등록하면 Kuromoji 형태소 분석으로 자동 토큰화
- **후리가나 표시**: 한자 위에 요미가나(ふりがな) 자동 표시, 온/오프 전환
- **NHK 악센트 사전**: Kanjium 데이터 기반, `￣[0]` / `(＼)[N]` 형식의 피치 악센트 표기
- **네이버 사전 연동**: 단어 클릭 시 한일 사전 뜻 팝업
- **번역 연습**: 문장별 번역 연습 & 자동 채점 (Google Translate + Gemini AI)
- **단어장**: CSV 기반 단어장 자동 생성, 악센트 정보 포함

## 기술 스택

| 영역 | 기술 |
|------|------|
| Frontend | React + TypeScript + Vite |
| Backend | Express.js (TypeScript) |
| DB | SQLite (better-sqlite3) |
| 형태소 분석 | Kuromoji (로컬, 무료) |
| 번역 | Google Translate Free API |
| 사전 | Naver 한일사전 API |
| 악센트 | Kanjium accents.txt (NHK 2016) |
| AI 채점 | Gemini API (선택) |

## 실행 방법

```bash
# 의존성 설치
npm install

# 악센트 사전 다운로드 (최초 1회)
# assets/accents.txt 가 없으면 아래 명령 실행
# curl -o assets/accents.txt https://raw.githubusercontent.com/mifunetoshiro/kanjium/master/data/source_files/raw/accents.txt

# 실행
npm run dev
```

## 환경 변수 (.env.local)

```
GEMINI_API_KEY=your_key_here  # 선택 (AI 채점용)
```

## 라이선스

MIT
