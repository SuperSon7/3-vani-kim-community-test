/*
 * Vani님의 부하 테스트 스크립트 (최종 수정본)
 *
 * 1. Vani님의 시나리오, SLO, 9:1 비율, 스파이크 테스트 (유지)
 * 2. '로그인 지옥' 문제 해결 (수정)
 * - setup() 함수를 추가해, 테스트 시작 전 100회만 로그인
 * - 시나리오 함수(read/write)는 setup()에서 받은 토큰을 재사용
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// =================================================================
// 1. 커스텀 메트릭 및 환경 변수
// =================================================================

// 커스텀 메트릭 (Vani님 설정)
const loginErrorRate = new Rate('login_errors');
const postListErrorRate = new Rate('post_list_errors');
const postDetailErrorRate = new Rate('post_detail_errors');
const likeErrorRate = new Rate('like_errors');
const commentErrorRate = new Rate('comment_errors');
const postCreateErrorRate = new Rate('post_create_errors');

// 응답 시간 메트릭 (Vani님 설정)
const loginDuration = new Trend('login_duration');
const postListDuration = new Trend('post_list_duration');
const postDetailDuration = new Trend('post_detail_duration');
const likeDuration = new Trend('like_duration');
const commentDuration = new Trend('comment_duration');
const postCreateDuration = new Trend('post_create_duration');

// 환경 변수
const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';
const API_VERSION = '/api/v1';
const TEST_USERS_COUNT = 100; // 100명의 유저 풀 사용

// =================================================================
// 2. 💥 [수정됨] SETUP 함수 (테스트 시작 전 1회 로그인)
// =================================================================

// 테스트 유저 정보 생성 (Vani님 로직)
function generateTestUsers(count) {
    const users = [];
    for (let i = 0; i < count; i++) {
        // 🔑 중요: Vani님의 'data-gen' 스크립트로 생성한
        // 'user' 계정 정보와 일치해야 합니다. (e.g., user0@test.com)
        // 🔑 Vani님 data-gen 코드: user${i}@test.com / dummyPassword (예시)
        users.push({
            email: `user${i}@test.com`,
            password: 'dummyPassword', // 🔑 Vani님 data-gen과 일치시킬 것
        });
    }
    return users;
}

// setup() 함수: 테스트 시작 전 '단 한 번' 실행됩니다.
export function setup() {
    console.log(`--- 🚀 테스트 준비: ${TEST_USERS_COUNT}명 유저 로그인 시작 ---`);
    const testUsers = generateTestUsers(TEST_USERS_COUNT);
    const tokens = [];

    // 100명의 유저로 '미리' 로그인해서 토큰 100개 확보
    testUsers.forEach(user => {
        const payload = JSON.stringify({ email: user.email, password: user.password });
        const params = {
            headers: { 'Content-Type': 'application/json' },
            tags: { name: 'SetupLogin' }, // setup 중 로그인임을 태깅
        };

        // 로그인 API 엔드포인트 (Vani님 코드 기반)
        const res = http.post(`${BASE_URL}${API_VERSION}/auth/tokens`, payload, params);

        // 로그인 API 응답 속도
        loginDuration.add(res.timings.duration);

        const success = check(res, {
            'setup login status is 200': (r) => r.status === 200,
            'setup login has token': (r) => r.json('accessToken') !== undefined,
        });

        loginErrorRate.add(!success);

        if (success && res.json('accessToken')) {
            tokens.push(res.json('accessToken'));
        } else {
            console.error(`로그인 실패: ${user.email}, 응답: ${res.body}`);
        }
    });

    if (tokens.length < TEST_USERS_COUNT * 0.8) { // 80% 이상 로그인 성공 못하면 테스트 중단
        throw new Error('로그인 실패율이 너무 높습니다. 유저 정보나 API 경로를 확인하세요.');
    }

    console.log(`--- ✅ 로그인 완료: ${tokens.length}개의 토큰 확보 ---`);
    // 이 토큰 데이터를 시나리오 함수(data)로 전달
    return { tokens: tokens };
}

// =================================================================
// 3. 테스트 옵션 (Vani님 설정 그대로)
// =================================================================
export const options = {
    scenarios: {
        // 시나리오 1: 읽기 유저 (90%)
        read_users: {
            executor: 'ramping-vus',
            exec: 'readUserScenario', // 'readUserScenario' 함수 실행
            startVUs: 0,
            stages: [
                { duration: '2m', target: 900 },   // 워밍업
                { duration: '10m', target: 9000 }, // 램프업
                { duration: '60m', target: 9000 }, // 유지
                { duration: '5m', target: 0 },     // 램프다운
            ],
        },
        // 시나리오 2: 쓰기 유저 (10%)
        write_users: {
            executor: 'ramping-vus',
            exec: 'writeUserScenario', // 'writeUserScenario' 함수 실행
            startVUs: 0,
            stages: [
                { duration: '2m', target: 100 },   // 워밍업
                { duration: '10m', target: 1000 }, // 램프업
                { duration: '60m', target: 1000 }, // 유지
                { duration: '5m', target: 0 },     // 램프다운
            ],
        },
        // 시나리오 3: 스파이크 테스트 (Vani님 설정)
        spike_test: {
            executor: 'ramping-vus',
            exec: 'readUserScenario', // 스파이크는 읽기 유저로 가정
            startVUs: 0,
            startTime: '40m', // 40분 후에 시작
            stages: [
                { duration: '1m', target: 4500 },
                { duration: '5m', target: 4500 },
                { duration: '1m', target: 0 },
            ],
        },
    },
    thresholds: {
        // Vani님의 SLO 설정 (그대로)
        'http_req_failed': ['rate<0.01'],
        'post_list_duration': ['p(50)<200', 'p(95)<400', 'p(99)<500'],
        'post_detail_duration': ['p(50)<200', 'p(95)<400', 'p(99)<500'],
        'like_duration': ['p(50)<300', 'p(99)<1000'],
        'comment_duration': ['p(50)<300', 'p(99)<1000'],
        'post_create_duration': ['p(50)<300', 'p(99)<1000'],
        'login_duration': ['p(50)<200', 'p(99)<800'],
        'login_errors': ['rate<0.01'],
        'post_list_errors': ['rate<0.01'],
        'post_detail_errors': ['rate<0.01'],
        'like_errors': ['rate<0.05'],
    },
};

// =================================================================
// 4. API 호출 헬퍼 함수 (Vani님 코드, 로그인 함수만 제거)
// =================================================================

// 💥 [제거됨] login() 함수는 setup()으로 이동했습니다.

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
    });
    postDetailErrorRate.add(!success);
    return success;
}

// 댓글 조회 (Vani님 코드)
function getComments(token, postId) {
    const params = {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
        tags: { name: 'Comments' },
    };
    const res = http.get(`${BASE_URL}${API_VERSION}/posts/${postId}/comments`, params);
    check(res, { 'comments status is 200': (r) => r.status === 200 });
}

// 좋아요 (Vani님 코드)
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
}

// 댓글 작성 (Vani님 코드)
function createComment(token, postId, content) {
    const payload = JSON.stringify({ content: content });
    const params = {
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
        },
        tags: { name: 'CreateComment' },
    };
    const res = http.post(`${BASE_URL}${API_VERSION}/posts/${postId}/comments`, payload, params);
    commentDuration.add(res.timings.duration);
    check(res, { 'comment create status is 200 or 201': (r) => r.status === 200 || r.status === 201 });
}

// 게시글 작성 (Vani님 코드)
function createPost(token, title, content) {
    const payload = JSON.stringify({ title: title, content: content });
    const params = {
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
        },
        tags: { name: 'CreatePost' },
    };
    const res = http.post(`${BASE_URL}${API_VERSION}/posts`, payload, params);
    postCreateDuration.add(res.timings.duration);
    check(res, { 'post create status is 200 or 201': (r) => r.status === 200 || r.status === 201 });
}


// =================================================================
// 5. 💥 [수정됨] 메인 시나리오 (로그인 제거)
// =================================================================

// 읽기 유저 시나리오 (data 파라미터로 setup의 토큰을 받음)
export function readUserScenario(data) {
    // 1. 💥 [수정됨] 로그인 삭제!
    // setup에서 받은 토큰 풀에서, VU(가상유저) 고유 ID 기반으로 토큰 할당
    const token = data.tokens[__VU % data.tokens.length];

    // 2. 메인 페이지 (Vani님 로직)
    const posts = getPostList(token, 0, 20);
    sleep(2);

    // 3. 스크롤링 (Vani님 로직)
    getPostList(token, 1, 20);
    sleep(2);

    // 4. 상세 게시글 접속 (Vani님 로직)
    if (posts.length > 0) {
        // 💥 [중요] Vani님의 /api/v1/posts 응답의 content 배열 내 객체에 'id' 필드가 있는지 확인하세요.
        const randomPost = posts[Math.floor(Math.random() * posts.length)];

        if (randomPost && randomPost.id) {
            getPostDetail(token, randomPost.id);
            getComments(token, randomPost.id);
            sleep(3);

            // 5. 좋아요
            likePost(token, randomPost.id);
            sleep(1);

            // 6. 상세 조회 반복 (Vani님 로직)
            if (posts.length > 1) {
                getPostList(token, 0, 10);
                sleep(1);
                const anotherPost = posts[Math.floor(Math.random() * posts.length)];
                if (anotherPost && anotherPost.id) {
                    getPostDetail(token, anotherPost.id);
                    getComments(token, anotherPost.id);
                    sleep(2);
                    likePost(token, anotherPost.id);
                    sleep(1);
                }
            }

            // 7. 댓글 작성 (Vani님 로직 - 20% 확률)
            if (Math.random() < 0.2) {
                createComment(token, randomPost.id, `k6 테스트 댓글 ${Date.now()}`);
                sleep(1);
            }
        } else {
            // posts 배열은 받았지만, post.id를 못 찾는 경우 (응답 구조 오류)
            postDetailErrorRate.add(1); // 에러 리포트
        }
    }

    sleep(Math.random() * 5); // 랜덤 대기
}

// 쓰기 유저 시나리오 (data 파라미터로 setup의 토큰을 받음)
export function writeUserScenario(data) {
    // 1. 💥 [수정됨] 로그인 삭제! 토큰 할당
    const token = data.tokens[__VU % data.tokens.length];

    // 2. 목록 조회 (Vani님 로직)
    getPostList(token, 0, 20);
    sleep(3);

    // 3. 게시글 작성 페이지 이동 시뮬레이션
    sleep(5);

    // 4. 게시글 작성 (Vani님 로직)
    createPost(
        token,
        `k6 부하 테스트 게시글 ${Date.Gnow()}`,
        `k6로 생성된 테스트 게시글입니다. ${Date.now()}`
    );
    sleep(2);

    // 5. 작성 후 목록 확인
    getPostList(token, 0, 20);
    sleep(Math.random() * 10); // 랜덤 대기
}