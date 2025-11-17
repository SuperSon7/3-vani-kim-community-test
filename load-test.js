import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// 커스텀 메트릭
const loginErrorRate = new Rate('login_errors');
const postListErrorRate = new Rate('post_list_errors');
const postDetailErrorRate = new Rate('post_detail_errors');
const likeErrorRate = new Rate('like_errors');
const commentErrorRate = new Rate('comment_errors');
const postCreateErrorRate = new Rate('post_create_errors');

// 응답 시간 메트릭
const loginDuration = new Trend('login_duration');
const postListDuration = new Trend('post_list_duration');
const postDetailDuration = new Trend('post_detail_duration');
const likeDuration = new Trend('like_duration');
const commentDuration = new Trend('comment_duration');
const postCreateDuration = new Trend('post_create_duration');

// 설정
export const options = {
  scenarios: {
    // 시나리오 1: 읽기 유저 (90%)
    read_users: {
      executor: 'ramping-vus',
      exec: 'readUserScenario',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 900 },   // 워밍업: 2분간 900명까지
        { duration: '10m', target: 9000 }, // 램프업: 10분간 9000명까지
        { duration: '60m', target: 9000 }, // 유지: 60분간 9000명 유지
        { duration: '5m', target: 0 },     // 램프다운: 5분간 0명까지
      ],
    },
    // 시나리오 2: 쓰기 유저 (10%)
    write_users: {
      executor: 'ramping-vus',
      exec: 'writeUserScenario',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 100 },   // 워밍업: 2분간 100명까지
        { duration: '10m', target: 1000 }, // 램프업: 10분간 1000명까지
        { duration: '60m', target: 1000 }, // 유지: 60분간 1000명 유지
        { duration: '5m', target: 0 },     // 램프다운: 5분간 0명까지
      ],
    },
    // 시나리오 3: 스파이크 테스트 (피크의 1.5배)
    spike_test: {
      executor: 'ramping-vus',
      exec: 'readUserScenario',
      startVUs: 0,
      startTime: '40m', // 40분 후에 시작
      stages: [
        { duration: '1m', target: 4500 },  // 1분간 급증 (9000 * 0.5)
        { duration: '5m', target: 4500 },  // 5분간 유지
        { duration: '1m', target: 0 },     // 1분간 감소
      ],
    },
  },
  thresholds: {
    // 전체 HTTP 요청 성공률
    'http_req_failed': ['rate<0.01'], // 에러율 1% 미만

    // 읽기 API 응답 시간
    'post_list_duration': ['p(50)<200', 'p(95)<400', 'p(99)<500'],
    'post_detail_duration': ['p(50)<200', 'p(95)<400', 'p(99)<500'],

    // 쓰기 API 응답 시간
    'like_duration': ['p(50)<300', 'p(99)<1000'],
    'comment_duration': ['p(50)<300', 'p(99)<1000'],
    'post_create_duration': ['p(50)<300', 'p(99)<1000'],

    // 인증 API 응답 시간
    'login_duration': ['p(50)<200', 'p(99)<800'],

    // 에러율
    'login_errors': ['rate<0.01'],
    'post_list_errors': ['rate<0.01'],
    'post_detail_errors': ['rate<0.01'],
    'like_errors': ['rate<0.05'], // 좋아요는 5% 허용 (중복 등)
  },
};

// 환경 변수
const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';
const API_VERSION = '/api/v1';

// 테스트 데이터 (실제 생성된 데이터 사용)
const TEST_USERS = generateTestUsers(100); // ltuser0 ~ ltuser99

function generateTestUsers(count) {
  const users = [];
  for (let i = 0; i < count; i++) {
    users.push({
      email: `user${i}@test.com`,
      password: 'dummyPassword', // 실제 비밀번호는 환경에 맞게 수정
    });
  }
  return users;
}

// 랜덤 유저 선택
function getRandomUser() {
  return TEST_USERS[Math.floor(Math.random() * TEST_USERS.length)];
}

// 로그인 함수
function login(user) {
  const payload = JSON.stringify({
    email: user.email,
    password: user.password,
  });

  const params = {
    headers: { 'Content-Type': 'application/json' },
    tags: { name: 'Login' },
  };

  const res = http.post(`${BASE_URL}${API_VERSION}/auth/tokens`, payload, params);

  loginDuration.add(res.timings.duration);

  const success = check(res, {
    'login status is 200': (r) => r.status === 200,
    'login has token': (r) => r.json('accessToken') !== undefined,
  });

  loginErrorRate.add(!success);

  if (success && res.json('accessToken')) {
    return res.json('accessToken');
  }

  return null;
}

// 게시글 목록 조회
function getPostList(token, page = 0, size = 20) {
  const params = {
    headers: token ? { 'Authorization': `Bearer ${token}` } : {},
    tags: { name: 'PostList' },
  };

  const res = http.get(`${BASE_URL}${API_VERSION}/posts?page=${page}&size=${size}`, params);

  postListDuration.add(res.timings.duration);

  const success = check(res, {
    'post list status is 200': (r) => r.status === 200,
    'post list has data': (r) => r.json('content') !== undefined,
  });

  postListErrorRate.add(!success);

  if (success && res.json('content')) {
    return res.json('content');
  }

  return [];
}

// 게시글 상세 조회
function getPostDetail(token, postId) {
  const params = {
    headers: token ? { 'Authorization': `Bearer ${token}` } : {},
    tags: { name: 'PostDetail' },
  };

  const res = http.get(`${BASE_URL}${API_VERSION}/posts/${postId}`, params);

  postDetailDuration.add(res.timings.duration);

  const success = check(res, {
    'post detail status is 200': (r) => r.status === 200,
    'post detail has content': (r) => r.json('content') !== undefined,
  });

  postDetailErrorRate.add(!success);

  return success;
}

// 댓글 조회 (게시글 상세에 포함되어 있다고 가정, 별도 API 있으면 수정)
function getComments(token, postId) {
  const params = {
    headers: token ? { 'Authorization': `Bearer ${token}` } : {},
    tags: { name: 'Comments' },
  };

  const res = http.get(`${BASE_URL}${API_VERSION}/posts/${postId}/comments`, params);

  const success = check(res, {
    'comments status is 200': (r) => r.status === 200,
  });

  return success;
}

// 좋아요
function likePost(token, postId) {
  const params = {
    headers: token ? { 'Authorization': `Bearer ${token}` } : {},
    tags: { name: 'Like' },
  };

  const res = http.post(`${BASE_URL}${API_VERSION}/posts/${postId}/likes`, null, params);

  likeDuration.add(res.timings.duration);

  const success = check(res, {
    'like status is 200 or 201': (r) => r.status === 200 || r.status === 201,
  });

  likeErrorRate.add(!success);

  return success;
}

// 댓글 작성
function createComment(token, postId, content) {
  const payload = JSON.stringify({
    content: content,
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    tags: { name: 'CreateComment' },
  };

  const res = http.post(`${BASE_URL}${API_VERSION}/posts/${postId}/comments`, payload, params);

  commentDuration.add(res.timings.duration);

  const success = check(res, {
    'comment create status is 200 or 201': (r) => r.status === 200 || r.status === 201,
  });

  commentErrorRate.add(!success);

  return success;
}

// 게시글 작성
function createPost(token, title, content) {
  const payload = JSON.stringify({
    title: title,
    content: content,
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    tags: { name: 'CreatePost' },
  };

  const res = http.post(`${BASE_URL}${API_VERSION}/posts`, payload, params);

  postCreateDuration.add(res.timings.duration);

  const success = check(res, {
    'post create status is 200 or 201': (r) => r.status === 200 || r.status === 201,
  });

  postCreateErrorRate.add(!success);

  return success;
}

// 읽기 유저 시나리오 (1분간)
export function readUserScenario() {
  const user = getRandomUser();

  // 1. 로그인
  const token = login(user);
  if (!token) {
    sleep(1);
    return;
  }

  sleep(1); // 사용자 행동 시뮬레이션

  // 2. 메인 페이지 (게시글 목록 조회)
  const posts = getPostList(token, 0, 20);
  sleep(2);

  // 3. 스크롤링 (목록 추가 조회)
  getPostList(token, 1, 20);
  sleep(2);

  // 4. 상세 게시글 접속
  if (posts.length > 0) {
    const randomPost = posts[Math.floor(Math.random() * posts.length)];
    getPostDetail(token, randomPost.id);
    getComments(token, randomPost.id);
    sleep(3);

    // 5. 좋아요
    likePost(token, randomPost.id);
    sleep(1);

    // 6. 상세 조회 반복
    if (posts.length > 1) {
      // 목록 절반 조회
      getPostList(token, 0, 10);
      sleep(1);

      const anotherPost = posts[Math.floor(Math.random() * posts.length)];
      getPostDetail(token, anotherPost.id);
      getComments(token, anotherPost.id);
      sleep(2);

      // 좋아요
      likePost(token, anotherPost.id);
      sleep(1);
    }
  }

  // 7. 댓글 작성 (20% 확률)
  if (Math.random() < 0.2 && posts.length > 0) {
    const randomPost = posts[Math.floor(Math.random() * posts.length)];
    createComment(token, randomPost.id, `k6 테스트 댓글 ${Date.now()}`);
    sleep(1);
  }

  sleep(Math.random() * 5); // 랜덤 대기 (0~5초)
}

// 쓰기 유저 시나리오 (5분간)
export function writeUserScenario() {
  const user = getRandomUser();

  // 1. 로그인
  const token = login(user);
  if (!token) {
    sleep(1);
    return;
  }

  sleep(2);

  // 2. 목록 조회 (메인 페이지)
  getPostList(token, 0, 20);
  sleep(3);

  // 3. 게시글 작성 페이지 이동 시뮬레이션
  sleep(5);

  // 4. 게시글 작성
  createPost(
    token,
    `k6 부하 테스트 게시글 ${Date.now()}`,
    `k6로 생성된 테스트 게시글입니다. ${Date.now()}`
  );

  sleep(2);

  // 5. 작성 후 목록 확인
  getPostList(token, 0, 20);

  sleep(Math.random() * 10); // 랜덤 대기 (0~10초)
}