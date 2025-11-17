# k6 부하 테스트

## 설치

### macOS
```bash
brew install k6
```

### Linux
```bash
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6
```

## 테스트 실행

### 1. 스모크 테스트 (기본 기능 확인)
```bash
k6 run smoke-test.js
```

### 2. 부하 테스트 (로컬)
```bash
k6 run load-test.js
```

### 3. 부하 테스트 (원격 서버)
```bash
k6 run -e BASE_URL=http://your-server-ip:8080 load-test.js
```

### 4. 결과를 JSON으로 저장
```bash
k6 run --out json=results.json load-test.js
```

### 5. 결과를 InfluxDB로 전송 (실시간 모니터링)
```bash
k6 run --out influxdb=http://localhost:8086/k6 load-test.js
```

## 테스트 시나리오

### 목표
- **총 QPS**: 1,543 (읽기 1,210 + 쓰기 333)
- **피크 QPS**: 2,315 (스파이크 1.5배)
- **CCU**: 10,000 (읽기 9,000 + 쓰기 1,000)

### 읽기 유저 (90%)
1분간 다음 행동 반복:
1. 로그인 (1회)
2. 게시글 목록 조회 (1.5회)
3. 게시글 상세 조회 (2회)
4. 댓글 조회 (2회)
5. 좋아요 (2회)
6. 댓글 작성 (0.2회 - 20% 확률)

**총 읽기**: 8회 / 1분
**총 쓰기**: 2.2회 / 1분

### 쓰기 유저 (10%)
5분간 다음 행동 반복:
1. 로그인 (1회)
2. 게시글 목록 조회 (1회)
3. 게시글 작성 페이지 (1회)
4. 게시글 작성 (1회)

**총 읽기**: 3회 / 5분
**총 쓰기**: 1회 / 5분

## 응답 시간 목표

### 읽기 API
- p50: 100-200ms
- p95: 400ms
- p99: 500ms

### 쓰기 API
- p50: 300ms
- p99: 1000ms

### 인증 API
- p50: 200ms
- p99: 800ms

## 테스트 단계

### Stage 1: 워밍업 (2분)
- 0 → 1,000 VUs (읽기 900 + 쓰기 100)
- 시스템이 점진적으로 부하에 적응

### Stage 2: 램프업 (10분)
- 1,000 → 10,000 VUs (읽기 9,000 + 쓰기 1,000)
- 목표 CCU까지 점진적으로 증가

### Stage 3: 유지 (60분)
- 10,000 VUs 유지
- 시스템 안정성 검증

### Stage 4: 스파이크 (40분 후, 7분간)
- 추가 4,500 VUs (총 14,500 VUs)
- 피크의 1.5배 부하 시뮬레이션

### Stage 5: 램프다운 (5분)
- 10,000 → 0 VUs
- 정상 종료 확인

## 결과 분석

### 성공 기준
- ✅ HTTP 에러율 < 1%
- ✅ 읽기 API p99 < 500ms
- ✅ 쓰기 API p99 < 1000ms
- ✅ 인증 API p99 < 800ms

### 주요 메트릭
```
http_reqs..................: 총 요청 수
http_req_duration..........: 요청 응답 시간 (p50, p95, p99)
http_req_failed............: 실패율
vus........................: 가상 사용자 수
iterations.................: 시나리오 완료 횟수
```

### 커스텀 메트릭
```
login_duration.............: 로그인 응답 시간
post_list_duration.........: 게시글 목록 응답 시간
post_detail_duration.......: 게시글 상세 응답 시간
like_duration..............: 좋아요 응답 시간
comment_duration...........: 댓글 작성 응답 시간
post_create_duration.......: 게시글 작성 응답 시간
```

## 모니터링

### Grafana + InfluxDB 설정
```bash
# InfluxDB 설치 및 실행
docker run -d -p 8086:8086 influxdb:1.8

# Grafana 설치 및 실행
docker run -d -p 3000:3000 grafana/grafana

# k6 실행 (InfluxDB 전송)
k6 run --out influxdb=http://localhost:8086/k6 load-test.js
```

Grafana 대시보드:
- http://localhost:3000 (admin/admin)
- InfluxDB 데이터소스 추가
- k6 대시보드 import (ID: 2587)

## 주의사항

1. **테스트 전 확인**
   - 애플리케이션이 실행 중인지 확인
   - 데이터베이스에 테스트 데이터 생성 완료
   - 충분한 서버 리소스 확보 (CPU, 메모리, 네트워크)

2. **테스트 데이터**
   - `ltuser0` ~ `ltuser99` 회원 필요
   - 게시글 1,000,000개 이상 권장
   - 댓글, 좋아요 데이터 존재

3. **네트워크**
   - k6와 서버 간 네트워크 지연 최소화
   - 같은 리전에서 테스트 권장

4. **동시 접속**
   - k6 실행 머신의 리소스 확인
   - 필요시 여러 머신에서 분산 실행

## 문제 해결

### 연결 거부 (Connection Refused)
```bash
# 방화벽 확인
sudo ufw status

# 포트 확인
netstat -an | grep 8080
```

### 타임아웃 발생
```javascript
// load-test.js에서 타임아웃 증가
export const options = {
  httpDebug: 'full',
  timeout: '60s',
};
```

### 메모리 부족
```bash
# k6 실행 시 메모리 제한 증가
ulimit -n 250000
```