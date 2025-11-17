import http from 'k6/http';
import { check, sleep } from 'k6';

// 스모크 테스트: 기본 기능이 작동하는지 확인
export const options = {
  vus: 1,
  duration: '1m',
  thresholds: {
    'http_req_failed': ['rate<0.01'],
    'http_req_duration': ['p(99)<1000'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';
const API_VERSION = '/api/v1';

export default function() {
  // 1. 상태 확인
  let res = http.get(`${BASE_URL}/api/loadtest/status`);
  check(res, {
    'status check is 200': (r) => r.status === 200,
  });

  sleep(1);

  // 2. 게시글 목록 조회 (인증 없이)
  res = http.get(`${BASE_URL}${API_VERSION}/posts?page=0&size=20`);
  check(res, {
    'post list is 200': (r) => r.status === 200,
    'post list has content': (r) => r.json('content') !== undefined,
  });

  sleep(1);

  // 3. 로그인 시도
  const loginPayload = JSON.stringify({
    email: 'user0@test.com',
    password: 'dummyPassword',
  });

  res = http.post(
    `${BASE_URL}${API_VERSION}/auth/tokens`,
    loginPayload,
    { headers: { 'Content-Type': 'application/json' } }
  );

  check(res, {
    'login is 200': (r) => r.status === 200,
  });

  sleep(1);
}