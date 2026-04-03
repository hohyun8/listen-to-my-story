// ================================================================
// app.js - "내 이야기를 들어줘!" AI 심리 상담 웹사이트 스크립트
//
// 이 파일이 하는 일:
//   1. Gemini API를 호출해서 AI 응답을 받아옴
//   2. API 키를 브라우저(localStorage)에 저장/불러오기
//   3. 채팅 메시지를 화면에 표시하고 히스토리를 관리
//   4. 타이핑 인디케이터를 보여주고 숨김
//   5. 사용자 편의 기능(빠른 시작, 대화 초기화 등) 처리
// ================================================================


// ----------------------------------------------------------------
// 상수 (Constants) - 변하지 않는 고정 값들
// ----------------------------------------------------------------

// Gemini API 엔드포인트 주소
// {API_KEY} 부분은 실제 API 키로 교체됨
const GEMINI_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-preview:generateContent';

// localStorage에 API 키를 저장할 때 사용하는 키 이름
const API_KEY_STORAGE_KEY = 'phylosophy_gemini_api_key';

// 대화 히스토리 최대 보관 개수 (초과 시 오래된 메시지부터 제거)
// 너무 많은 히스토리는 API 요청 크기를 늘리고 비용을 높임
// 주의: role은 반드시 user/model이 번갈아 나와야 하므로 짝수로 설정
const MAX_HISTORY_MESSAGES = 20;

// AI 상담사 시스템 프롬프트 - AI의 역할과 행동 방식을 정의
// 이 텍스트가 AI에게 "어떻게 행동해야 하는지"를 알려줌
const SYSTEM_PROMPT = `당신은 따뜻하고 공감적인 심리 상담사 "마음이"입니다.

역할 및 태도:
- 사용자의 감정을 먼저 인정하고 공감해주세요. 감정을 확인하기 전에 해결책을 제시하지 마세요.
- 판단하지 않고 경청하며 지지해주세요. 어떤 이야기를 해도 비판하지 않습니다.
- 따뜻하고 부드러운 말투를 사용하되, 너무 형식적이거나 딱딱하지 않게 대화해주세요.
- 해결책을 강요하지 마세요. 때로는 그냥 들어주는 것이 가장 큰 도움이 됩니다.
- 필요시 구체적인 대처 방법을 제안하되, 사용자가 준비되었을 때만 제안하세요.

대화 방식:
- 한 번에 너무 많은 질문을 하지 말고, 한두 가지 질문만 하세요.
- 전문 용어보다는 일상적이고 따뜻한 언어를 사용하세요.
- 사용자의 강점과 회복력을 발견하고 응원해주세요.
- 너무 길지 않게, 자연스러운 대화체로 응답하세요. (3~5문장 정도가 적당합니다)

위기 상황 대응 (최우선 사항):
- 사용자가 자해, 자살 충동, 또는 심각한 위기 상황을 언급하면 즉시 다음 위기상담 전화를 안내하세요:
  * 자살예방상담전화: 1393 (24시간)
  * 정신건강위기상담전화: 1577-0199 (24시간)
  * 청소년 전용: 청소년상담 1388
- 위기 상황에서는 전문 도움을 받도록 강하게 권유하세요.

중요한 한계:
- 당신은 AI이며, 전문 심리 치료사나 정신과 의사를 대체할 수 없습니다.
- 처방약, 의학적 진단, 구체적인 치료 계획은 제시하지 마세요.

언어: 항상 한국어로만 응답하세요.`;


// ----------------------------------------------------------------
// 상태 변수 (State Variables) - 앱이 실행되는 동안 변하는 값들
// ----------------------------------------------------------------

// 전체 대화 히스토리를 저장하는 배열
// 형식: [{ role: 'user' | 'model', parts: [{ text: '메시지 내용' }] }, ...]
// Gemini API가 요구하는 형식 그대로 저장
let chatHistory = [];

// AI 응답을 기다리는 중인지 여부 (true면 전송 버튼 비활성화)
let isWaitingForResponse = false;


// ----------------------------------------------------------------
// DOM 요소 참조 (DOM References)
// HTML에서 자주 사용하는 요소를 변수에 저장해두면 매번 찾지 않아도 됨
// ----------------------------------------------------------------

// 채팅 메시지가 표시되는 스크롤 가능한 영역
const chatMessagesEl = document.getElementById('chatMessages');

// 사용자 메시지 입력 텍스트에어리어
const messageInputEl = document.getElementById('messageInput');

// 전송 버튼
const sendBtnEl = document.getElementById('sendBtn');

// 타이핑 인디케이터 (AI 응답 대기 중 애니메이션)
const typingIndicatorEl = document.getElementById('typingIndicator');

// API 키 입력창
const apiKeyInputEl = document.getElementById('apiKeyInput');

// API 키 상태 메시지 표시 영역
const apiStatusMessageEl = document.getElementById('apiStatusMessage');

// API 키 섹션의 접기/펼치기 본문
const apiKeyBodyEl = document.getElementById('apiKeyBody');

// 접기/펼치기 화살표 버튼
const toggleApiBtnEl = document.getElementById('toggleApiBtn');

// 웰컴 메시지 영역 (첫 메시지 보내면 숨겨짐)
const welcomeMessageEl = document.getElementById('welcomeMessage');


// ================================================================
// 초기화 함수 (Initialization)
// 페이지가 처음 로드될 때 실행되는 설정 코드
// ================================================================
function initialize() {
  // localStorage에 저장된 API 키가 있으면 불러와서 입력창에 표시
  const savedApiKey = loadApiKey();
  if (savedApiKey) {
    // 입력창에는 표시하지 않고 (보안상 마스킹 유지)
    // 저장된 키가 있다는 것을 상태 메시지로 알림
    showApiStatus('저장된 API 키가 있어요. 바로 상담을 시작할 수 있어요! 🌿', 'success');
    // API 키가 저장되어 있으면 API 섹션을 자동으로 접기
    collapseApiSection();
  }

  // sessionStorage에 저장된 대화 히스토리가 있으면 복원
  // 사용자가 실수로 새로고침했을 때 대화가 사라지지 않도록 함
  // (단, 탭을 닫으면 sessionStorage도 사라지므로 장기 저장은 안 됨)
  const savedHistory = loadHistoryFromSession();
  if (savedHistory.length > 0) {
    chatHistory = savedHistory;
    console.log(`[히스토리 복원] 이전 대화 ${chatHistory.length}개 메시지를 복원했어요.`);
    // 복원된 히스토리가 있으면 웰컴 메시지를 숨기고 복원 안내 표시
    if (welcomeMessageEl) {
      welcomeMessageEl.classList.add('hidden');
    }
    appendMessageToUI('ai', '이전 대화를 이어서 진행해요. 오늘도 편하게 이야기해주세요.');
  }

  // 입력창 높이 자동 조절 이벤트 등록
  // 사용자가 긴 메시지를 쓸 때 입력창이 자동으로 늘어나게 함
  messageInputEl.addEventListener('input', autoResizeTextarea);

  // 키보드 이벤트 등록: Enter 키 전송, Shift+Enter 줄바꿈
  messageInputEl.addEventListener('keydown', handleKeyDown);

  // 입력창에 포커스
  messageInputEl.focus();
}


// ================================================================
// API 키 관련 함수들
// ================================================================

/**
 * localStorage에서 API 키를 읽어옴
 * @returns {string|null} 저장된 API 키, 없으면 null
 */
function loadApiKey() {
  // localStorage는 브라우저에 데이터를 영구적으로 저장하는 공간
  // 탭을 닫아도 데이터가 유지됨
  return localStorage.getItem(API_KEY_STORAGE_KEY);
}

/**
 * API 키를 localStorage에 저장
 * HTML의 저장 버튼을 클릭하면 이 함수가 실행됨
 */
function saveApiKey() {
  const apiKey = apiKeyInputEl.value.trim();

  // 입력값이 비어 있으면 저장하지 않음
  if (!apiKey) {
    showApiStatus('API 키를 입력해주세요.', 'error');
    return;
  }

  // API 키 형식 검사 (Gemini API 키는 보통 "AIza"로 시작)
  if (!apiKey.startsWith('AIza')) {
    showApiStatus('올바른 Gemini API 키 형식이 아닌 것 같아요. "AIza"로 시작하는지 확인해주세요.', 'error');
    return;
  }

  // localStorage에 저장
  localStorage.setItem(API_KEY_STORAGE_KEY, apiKey);

  // 저장 성공 메시지 표시
  showApiStatus('API 키가 저장되었어요! 이제 상담을 시작할 수 있어요 🌿', 'success');

  // 보안을 위해 입력창의 내용을 지움
  apiKeyInputEl.value = '';

  // API 키가 저장되었으면 섹션 접기
  setTimeout(() => {
    collapseApiSection();
  }, 1500); // 1.5초 후 접기 (사용자가 성공 메시지를 볼 수 있도록)
}

/**
 * 저장된 API 키를 삭제
 * HTML의 삭제 버튼을 클릭하면 이 함수가 실행됨
 */
function deleteApiKey() {
  // localStorage에서 API 키 항목 제거
  localStorage.removeItem(API_KEY_STORAGE_KEY);

  // 입력창도 비우기
  apiKeyInputEl.value = '';

  showApiStatus('API 키가 삭제되었어요.', 'success');
}

/**
 * API 키 입력 보이기/숨기기 토글
 * 눈 모양 버튼을 클릭하면 실행됨
 */
function toggleKeyVisibility() {
  // type이 'password'면 텍스트로, 텍스트면 'password'로 전환
  if (apiKeyInputEl.type === 'password') {
    apiKeyInputEl.type = 'text';
  } else {
    apiKeyInputEl.type = 'password';
  }
}

/**
 * API 상태 메시지를 표시
 * @param {string} message - 표시할 메시지 텍스트
 * @param {string} type - 'success' 또는 'error'
 */
function showApiStatus(message, type) {
  apiStatusMessageEl.textContent = message;
  // 기존 클래스를 모두 제거하고 새 클래스 추가
  apiStatusMessageEl.className = 'api-status-message ' + type;
}

/**
 * API 키 섹션 접기/펼치기 토글
 * 헤더의 화살표 버튼을 클릭하면 실행됨
 */
function toggleApiSection() {
  const isCollapsed = apiKeyBodyEl.classList.contains('collapsed');

  if (isCollapsed) {
    // 현재 접혀있으면 펼치기
    apiKeyBodyEl.classList.remove('collapsed');
    toggleApiBtnEl.textContent = '▲';
    // 스크린리더에 "펼쳐짐" 상태를 알림 (aria-expanded 속성 동기화)
    toggleApiBtnEl.setAttribute('aria-expanded', 'true');
  } else {
    // 현재 펼쳐있으면 접기
    collapseApiSection();
  }
}

/**
 * API 키 섹션을 접는 함수 (내부 사용)
 */
function collapseApiSection() {
  apiKeyBodyEl.classList.add('collapsed');
  toggleApiBtnEl.textContent = '▼';
  // 스크린리더에 "접혀짐" 상태를 알림 (aria-expanded 속성 동기화)
  toggleApiBtnEl.setAttribute('aria-expanded', 'false');
}


// ================================================================
// Gemini API 호출 함수
// 실제로 AI와 통신하는 핵심 함수
// ================================================================

/**
 * Gemini API에 메시지를 보내고 응답을 받아오는 함수
 *
 * @param {Array} history - 전체 대화 히스토리 배열
 * @returns {Promise<string>} AI의 응답 텍스트
 *
 * Gemini API 요청 형식:
 * POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-preview:generateContent?key=API_KEY
 * Body: {
 *   "systemInstruction": { "parts": [{ "text": "시스템 프롬프트" }] },
 *   "contents": [
 *     { "role": "user", "parts": [{ "text": "첫 번째 사용자 메시지" }] },
 *     { "role": "model", "parts": [{ "text": "첫 번째 AI 응답" }] },
 *     { "role": "user", "parts": [{ "text": "두 번째 사용자 메시지" }] }
 *   ]
 * }
 */
async function callGeminiApi(history) {
  // localStorage에서 API 키 가져오기
  const apiKey = loadApiKey();

  // API 키가 없으면 에러 발생
  if (!apiKey) {
    throw new Error('API_KEY_MISSING'); // 특수 에러 코드로 던짐
  }

  // API 요청 URL (API 키를 쿼리 파라미터로 포함)
  const url = `${GEMINI_API_URL}?key=${apiKey}`;

  // API에 보낼 요청 데이터 구성
  const requestBody = {
    // 시스템 프롬프트: AI의 역할과 행동 방식 정의
    systemInstruction: {
      parts: [
        { text: SYSTEM_PROMPT }
      ]
    },
    // 대화 히스토리: 전체 대화 내용 (맥락 유지를 위해)
    contents: history,
    // 생성 설정 (선택사항)
    generationConfig: {
      temperature: 0.85,       // 창의성 수준 (0~1, 높을수록 다양한 응답)
      maxOutputTokens: 1024,   // 응답 최대 길이 (토큰 단위)
      topP: 0.95,              // 다양성 제어 파라미터
    }
  };

  // fetch API를 사용해서 POST 요청 보내기
  // await: 응답이 올 때까지 기다림 (비동기 처리)
  // 네트워크 오류(인터넷 끊김 등)는 fetch 자체에서 예외를 던지므로
  // 호출하는 쪽(sendMessage)의 try-catch에서 잡힘
  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json', // JSON 형식으로 보냄을 명시
      },
      body: JSON.stringify(requestBody), // 자바스크립트 객체를 JSON 문자열로 변환
    });
  } catch (networkError) {
    // fetch 자체가 실패하는 경우: 인터넷 연결 없음, DNS 오류 등
    console.error('[네트워크 오류]', networkError);
    throw new Error('인터넷 연결을 확인해주세요. 네트워크 오류가 발생했어요.');
  }

  // HTTP 에러 처리 (4xx, 5xx 응답 코드)
  if (!response.ok) {
    // 응답 본문에서 에러 내용 읽기 (Gemini API는 에러 상세를 JSON으로 반환)
    let errorData;
    try {
      errorData = await response.json();
    } catch {
      errorData = null;
    }

    // API에서 내려준 에러 메시지 추출 (있을 경우 활용)
    const apiErrorMessage = errorData?.error?.message || '';

    // HTTP 상태 코드별 한국어 에러 메시지
    if (response.status === 400) {
      // 400: 요청 형식 오류 - 히스토리 구조가 잘못된 경우에도 발생할 수 있음
      throw new Error('요청 형식이 올바르지 않아요. 대화를 초기화한 후 다시 시도해주세요.');
    } else if (response.status === 401) {
      // 401: 인증 실패 - API 키가 아예 유효하지 않은 경우
      throw new Error('API 키 인증에 실패했어요. API 키가 올바른지 다시 확인해주세요.');
    } else if (response.status === 403) {
      // 403: 권한 없음 - API 키는 유효하지만 해당 모델/기능에 접근 권한이 없는 경우
      throw new Error('API 키 권한이 없어요. Gemini API가 활성화되어 있는지 확인해주세요.');
    } else if (response.status === 429) {
      // 429: 요청 한도 초과 - 무료 플랜은 분당 요청 횟수 제한이 있음
      throw new Error('요청이 너무 많아요. 잠시 기다렸다가 다시 시도해주세요. (1분 후 재시도를 권장해요)');
    } else if (response.status === 500 || response.status === 503) {
      // 500/503: Gemini 서버 오류 - 일시적인 문제일 가능성이 높음
      throw new Error('Gemini 서버에 일시적인 문제가 생겼어요. 잠시 후 다시 시도해주세요.');
    } else {
      // 그 외의 예상치 못한 에러
      const fallbackMessage = apiErrorMessage || `알 수 없는 오류가 발생했어요. (HTTP ${response.status})`;
      throw new Error(fallbackMessage);
    }
  }

  // 응답 JSON 파싱 (JSON 문자열을 자바스크립트 객체로 변환)
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error('AI 응답을 처리하는 중 오류가 발생했어요. 다시 시도해주세요.');
  }

  // Gemini API 응답 구조에서 텍스트 추출
  // 응답 구조: data.candidates[0].content.parts[0].text
  const aiText = data?.candidates?.[0]?.content?.parts?.[0]?.text;

  // 응답 텍스트가 없으면 에러 - 여러 가지 원인이 있을 수 있음
  if (!aiText) {
    // finishReason으로 원인 파악 시도
    const finishReason = data?.candidates?.[0]?.finishReason;

    if (finishReason === 'SAFETY') {
      // 안전 필터에 의해 응답이 차단된 경우
      throw new Error('안전 정책에 의해 응답이 차단되었어요. 다른 방식으로 이야기해주세요.');
    } else if (finishReason === 'MAX_TOKENS') {
      // 토큰 한도 초과 - generationConfig.maxOutputTokens에 걸린 경우
      throw new Error('응답이 너무 길어서 잘렸어요. 다시 시도해주세요.');
    } else if (finishReason === 'RECITATION') {
      // 저작권 보호 콘텐츠 반복으로 차단된 경우
      throw new Error('응답 생성이 중단되었어요. 다른 방식으로 질문해주세요.');
    } else if (!data?.candidates || data.candidates.length === 0) {
      // candidates 배열 자체가 비어있는 경우 (프롬프트 자체가 차단된 경우 등)
      const blockReason = data?.promptFeedback?.blockReason;
      if (blockReason) {
        throw new Error(`메시지가 안전 정책에 의해 차단되었어요. (사유: ${blockReason})`);
      }
      throw new Error('AI 응답을 받지 못했어요. 다시 시도해주세요.');
    } else {
      throw new Error('AI 응답을 받지 못했어요. 다시 시도해주세요.');
    }
  }

  return aiText;
}


// ================================================================
// 채팅 UI 관련 함수들
// ================================================================

/**
 * 채팅 메시지 화면에 추가하는 함수
 *
 * @param {string} role - 'user' (사용자) 또는 'ai' (AI)
 * @param {string} text - 표시할 메시지 내용
 * @param {boolean} isError - 에러 메시지 여부 (선택사항)
 */
function appendMessageToUI(role, text, isError = false) {
  // 웰컴 메시지가 아직 보이면 숨기기 (첫 메시지부터 채팅 시작)
  if (welcomeMessageEl && !welcomeMessageEl.classList.contains('hidden')) {
    welcomeMessageEl.classList.add('hidden');
  }

  // 현재 시간 포맷팅 (HH:MM 형식)
  const now = new Date();
  const timeStr = now.getHours().toString().padStart(2, '0') + ':' +
                  now.getMinutes().toString().padStart(2, '0');

  // 메시지 행 요소 생성
  const messageRow = document.createElement('div');
  messageRow.className = `message-row ${role}`; // role에 따라 'user' 또는 'ai' 클래스

  // AI 메시지일 때 아바타 추가
  let avatarHTML = '';
  if (role === 'ai') {
    avatarHTML = `<div class="message-avatar">🌿</div>`;
  }

  // AI 메시지일 때 발신자 이름 표시
  let senderHTML = '';
  if (role === 'ai') {
    senderHTML = `<span class="message-sender">마음이</span>`;
  }

  // 텍스트 내용을 HTML 안전하게 처리 (XSS 방지)
  // < > & 같은 특수문자가 HTML 태그로 해석되지 않도록
  const safeText = escapeHTML(text);

  // 메시지 버블 HTML 구성
  const bubbleClass = isError ? 'message-bubble error-bubble' : 'message-bubble';
  messageRow.innerHTML = `
    ${avatarHTML}
    <div class="message-content">
      ${senderHTML}
      <div class="${bubbleClass}">${safeText}</div>
      <span class="message-time">${timeStr}</span>
    </div>
  `;

  // 채팅 메시지 영역에 새 메시지 추가
  chatMessagesEl.appendChild(messageRow);

  // 새 메시지가 보이도록 스크롤을 맨 아래로 이동
  scrollToBottom();
}

/**
 * 채팅 스크롤을 맨 아래로 부드럽게 이동
 * 새 메시지가 추가될 때마다 호출됨
 */
function scrollToBottom() {
  // smooth 옵션으로 부드럽게 스크롤
  chatMessagesEl.scrollTo({
    top: chatMessagesEl.scrollHeight,
    behavior: 'smooth'
  });
}

/**
 * HTML 특수문자를 이스케이프 (XSS 공격 방지)
 * 사용자 입력이나 AI 응답을 화면에 표시할 때 반드시 거쳐야 함
 *
 * @param {string} text - 원본 텍스트
 * @returns {string} HTML 안전 텍스트
 */
function escapeHTML(text) {
  // 임시 div를 만들어서 textContent로 설정하면 자동으로 이스케이프됨
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(text));
  return div.innerHTML;
}

/**
 * 타이핑 인디케이터 표시
 * AI가 응답을 생성하는 동안 점 3개가 움직이는 애니메이션 표시
 */
function showTypingIndicator() {
  typingIndicatorEl.classList.remove('hidden');
  // 타이핑 인디케이터도 보이도록 스크롤
  scrollToBottom();
}

/**
 * 타이핑 인디케이터 숨기기
 * AI 응답을 받으면 숨김
 */
function hideTypingIndicator() {
  typingIndicatorEl.classList.add('hidden');
}

/**
 * 전송 버튼과 입력창을 비활성화/활성화
 * AI 응답을 기다리는 동안 중복 전송 방지
 *
 * @param {boolean} disabled - true면 비활성화, false면 활성화
 */
function setInputDisabled(disabled) {
  sendBtnEl.disabled = disabled;
  messageInputEl.disabled = disabled;
  isWaitingForResponse = disabled;
}


// ================================================================
// 메시지 전송 관련 함수들
// ================================================================

/**
 * 메시지 전송 처리 - 핵심 함수
 * 전송 버튼 클릭 또는 Enter 키를 누르면 실행됨
 */
async function sendMessage() {
  // 입력창의 텍스트 가져오기 (앞뒤 공백 제거)
  const userMessage = messageInputEl.value.trim();

  // 빈 메시지는 전송하지 않음
  if (!userMessage) {
    return;
  }

  // 이미 응답을 기다리는 중이면 중복 전송 방지
  if (isWaitingForResponse) {
    return;
  }

  // API 키가 저장되어 있는지 확인
  const apiKey = loadApiKey();
  if (!apiKey) {
    // API 키 섹션을 펼치고 안내 메시지 표시
    apiKeyBodyEl.classList.remove('collapsed');
    toggleApiBtnEl.textContent = '▲';
    showApiStatus('상담을 시작하려면 먼저 API 키를 입력해주세요.', 'error');
    // 입력창은 비우지 않음 (사용자가 다시 전송할 수 있도록)
    return;
  }

  // --- 사용자 메시지 처리 ---

  // 1. 입력창 비우기
  messageInputEl.value = '';
  // 입력창 높이 초기화 (자동 크기 조절 때문에 늘어났을 수 있음)
  messageInputEl.style.height = 'auto';

  // 2. 사용자 메시지를 화면에 표시
  appendMessageToUI('user', userMessage);

  // 3. 사용자 메시지를 대화 히스토리에 추가
  // Gemini API 형식: { role: 'user', parts: [{ text: '...' }] }
  chatHistory.push({
    role: 'user',
    parts: [{ text: userMessage }]
  });

  // 대화 히스토리가 최대 개수를 초과하면 오래된 메시지부터 제거
  // Gemini API는 user/model이 반드시 번갈아 나와야 하므로
  // 항상 짝수 단위(user+model 한 쌍)로 잘라냄
  trimChatHistory();

  // 4. 입력창과 전송 버튼 비활성화 (응답 기다리는 동안)
  setInputDisabled(true);

  // 5. 타이핑 인디케이터 표시
  showTypingIndicator();

  // --- AI 응답 받기 ---
  try {
    // Gemini API 호출 (비동기 - 응답이 올 때까지 대기)
    const aiResponse = await callGeminiApi(chatHistory);

    // 타이핑 인디케이터 숨기기
    hideTypingIndicator();

    // AI 응답을 화면에 표시
    appendMessageToUI('ai', aiResponse);

    // AI 응답도 대화 히스토리에 추가 (다음 대화에서 맥락으로 사용됨)
    // Gemini API 형식: { role: 'model', parts: [{ text: '...' }] }
    chatHistory.push({
      role: 'model',
      parts: [{ text: aiResponse }]
    });

    // AI 응답 추가 후 히스토리를 sessionStorage에 백업
    // sessionStorage: 탭을 닫으면 사라짐 (현재 세션 동안만 유지)
    // localStorage와 달리 민감한 대화 내용이 장기간 남지 않아 더 안전
    saveHistoryToSession();

  } catch (error) {
    // 오류 발생 시 처리
    hideTypingIndicator();

    // 에러 종류에 따른 메시지 처리
    let errorMessage;
    if (error.message === 'API_KEY_MISSING') {
      // API 키 없음 오류
      errorMessage = '아직 API 키가 설정되지 않았어요. 위의 API 키 설정 섹션에서 키를 입력해주세요.';
      // API 섹션 펼치기
      apiKeyBodyEl.classList.remove('collapsed');
      toggleApiBtnEl.textContent = '▲';
    } else {
      errorMessage = `앗, 오류가 발생했어요: ${error.message}`;
    }

    // 에러 메시지를 AI 버블 스타일로 표시 (isError=true)
    appendMessageToUI('ai', errorMessage, true);

    // 오류가 발생했을 때 마지막으로 추가된 사용자 메시지를 히스토리에서 제거
    // (실패한 요청이 다음 요청에 영향주지 않도록)
    chatHistory.pop();

    // 콘솔에도 오류 기록 (개발자 도구에서 확인 가능)
    console.error('[Gemini API 오류]', error);

  } finally {
    // try/catch 결과에 상관없이 항상 실행됨
    // 입력창 다시 활성화
    setInputDisabled(false);
    // 입력창에 포커스 (사용자가 바로 다음 메시지를 입력할 수 있도록)
    messageInputEl.focus();
  }
}

/**
 * 빠른 시작 버튼 클릭 처리
 * 웰컴 화면의 버튼을 클릭하면 해당 텍스트가 자동으로 입력창에 들어가고 전송됨
 *
 * @param {string} text - 빠른 시작 버튼에 할당된 텍스트
 */
function quickStart(text) {
  // 입력창에 텍스트 설정
  messageInputEl.value = text;
  // 바로 전송
  sendMessage();
}

/**
 * 대화 히스토리가 최대 개수(MAX_HISTORY_MESSAGES)를 초과하면 앞부분을 잘라냄
 *
 * Gemini API는 대화가 항상 user → model → user → model ... 순서여야 함.
 * 따라서 잘라낼 때 반드시 user+model 쌍(2개) 단위로 제거해야 함.
 */
function trimChatHistory() {
  // 현재 히스토리 개수가 최대치 이하면 아무것도 하지 않음
  if (chatHistory.length <= MAX_HISTORY_MESSAGES) {
    return;
  }

  // 초과한 메시지 수 계산
  const excessCount = chatHistory.length - MAX_HISTORY_MESSAGES;

  // user+model 쌍 단위로 제거해야 하므로 짝수로 올림
  // 예: 3개 초과 → 4개 제거 (2쌍)
  const removeCount = excessCount % 2 === 0 ? excessCount : excessCount + 1;

  // 앞부분(오래된 메시지)부터 removeCount개 제거
  chatHistory.splice(0, removeCount);

  console.log(`[히스토리 정리] 오래된 메시지 ${removeCount}개를 제거했어요. 현재 ${chatHistory.length}개 보관 중.`);
}

/**
 * 현재 대화 히스토리를 sessionStorage에 저장
 *
 * sessionStorage: 브라우저 탭이 열려있는 동안만 유지 (탭 닫으면 자동 삭제)
 * 민감한 상담 내용이 장기간 로컬에 남지 않아 localStorage보다 적합함.
 * 새로고침 시에는 대화가 유지되는 편의성도 제공함.
 */
function saveHistoryToSession() {
  try {
    sessionStorage.setItem('phylosophy_chat_history', JSON.stringify(chatHistory));
  } catch (e) {
    // sessionStorage 용량 초과 등의 오류는 조용히 무시 (기능에 영향 없음)
    console.warn('[세션 저장 실패]', e);
  }
}

/**
 * sessionStorage에서 대화 히스토리를 복원
 * 새로고침 후에도 대화를 이어갈 수 있도록 함
 *
 * @returns {Array} 복원된 히스토리 배열, 없으면 빈 배열
 */
function loadHistoryFromSession() {
  try {
    const saved = sessionStorage.getItem('phylosophy_chat_history');
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    // 배열 형식인지 검증 (잘못된 데이터 방지)
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.warn('[세션 복원 실패]', e);
    return [];
  }
}

/**
 * 대화를 처음부터 다시 시작
 * 초기화 버튼(🔄)을 클릭하면 실행됨
 */
function resetChat() {
  // 이미 응답을 기다리는 중이면 초기화 불가
  if (isWaitingForResponse) {
    return;
  }

  // 사용자에게 확인 대화상자 표시
  const confirmed = confirm('대화를 처음부터 다시 시작할까요?\n지금까지의 대화 내용은 모두 사라져요.');

  if (!confirmed) {
    return; // 취소하면 아무것도 하지 않음
  }

  // 대화 히스토리 초기화
  chatHistory = [];

  // sessionStorage에 저장된 대화 히스토리도 함께 삭제
  sessionStorage.removeItem('phylosophy_chat_history');

  // 채팅 메시지 영역의 모든 내용 제거
  chatMessagesEl.innerHTML = '';

  // 웰컴 메시지 다시 표시
  // index.html 원본 구조와 동일하게 유지 (<nav> 태그, aria 속성 포함)
  const newWelcomeMessage = `
    <div class="welcome-message" id="welcomeMessage">
      <div class="welcome-icon" aria-hidden="true">🌸</div>
      <h3 class="welcome-title">새로운 시작이에요</h3>
      <p class="welcome-text">
        다시 찾아주셨군요, 반가워요! 😊<br />
        오늘은 어떤 이야기를 나눠볼까요?
      </p>
      <nav class="quick-start-buttons" aria-label="빠른 대화 시작">
        <button class="quick-btn" onclick="quickStart('오늘 너무 힘든 하루였어요.')">
          힘든 하루
        </button>
        <button class="quick-btn" onclick="quickStart('요즘 많이 불안해요.')">
          불안함
        </button>
        <button class="quick-btn" onclick="quickStart('마음이 답답하고 외로워요.')">
          외로움
        </button>
        <button class="quick-btn" onclick="quickStart('그냥 누군가에게 이야기하고 싶어요.')">
          그냥 이야기하고 싶어
        </button>
      </nav>
    </div>
  `;

  chatMessagesEl.innerHTML = newWelcomeMessage;

  // 입력창 포커스
  messageInputEl.focus();
}


// ================================================================
// 입력창 편의 기능 함수들
// ================================================================

/**
 * 텍스트에어리어 높이 자동 조절
 * 입력 내용이 많아지면 입력창이 자동으로 늘어남
 * input 이벤트가 발생할 때마다 실행됨
 */
function autoResizeTextarea() {
  // 높이를 auto로 초기화해야 scrollHeight가 정확하게 계산됨
  messageInputEl.style.height = 'auto';
  // scrollHeight: 내용 전체 높이 (스크롤 포함)
  // 최대 140px까지만 늘어나도록 (CSS의 max-height와 맞춤)
  const newHeight = Math.min(messageInputEl.scrollHeight, 140);
  messageInputEl.style.height = newHeight + 'px';
}

/**
 * 키보드 이벤트 처리
 * Enter 키: 메시지 전송
 * Shift+Enter: 줄바꿈
 *
 * @param {KeyboardEvent} event - 키보드 이벤트 객체
 */
function handleKeyDown(event) {
  if (event.key === 'Enter') {
    if (event.shiftKey) {
      // Shift+Enter: 줄바꿈 (기본 동작 유지, 아무것도 하지 않음)
      return;
    } else {
      // Enter만: 전송 (기본 줄바꿈 동작 막기)
      event.preventDefault();
      sendMessage();
    }
  }
}


// ================================================================
// 페이지 로드 시 초기화 실행
// DOM이 모두 준비된 후 initialize() 함수를 실행
// ================================================================
// DOMContentLoaded 이벤트: HTML 파싱이 완료되면 발생 (이미지 등 리소스는 제외)
// 이 파일은 <body> 맨 아래에 위치하므로 DOM이 이미 준비되어 있지만
// 명시적으로 이벤트를 사용하면 더 안전함
document.addEventListener('DOMContentLoaded', function () {
  initialize();
});
