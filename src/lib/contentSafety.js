const PROHIBITED_TERMS = [
  'fuck',
  'shit',
  'bitch',
  'asshole',
  'dick',
  'porn',
  'rape',
  'kill yourself',
  'suicide',
  'terror',
  'bomb',
  'drug',
  'hitman',
  '씨발',
  '좆',
  '병신',
  '년아',
  '강간',
  '자살',
  '죽여',
  '테러',
  '마약',
  '살인',
  '폭탄',
];

const normalize = text =>
  text
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const stripSymbols = text =>
  text
    .replace(/[!"#$%&'()*+,./:;<=>?@[\\\]^_`{|}~-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const sanitizeUserInput = value => {
  if (typeof value !== 'string') return value;
  return normalize(value);
};

export const ensureSafeContent = (fields = []) => {
  if (!Array.isArray(fields)) {
    throw new Error('fields must be an array.');
  }

  const sanitized = {};

  fields.forEach((field, index) => {
    const { value, label, key, allowEmpty = true } = field || {};
    const targetKey = key || label || `field_${index}`;
    const sanitizedValue = sanitizeUserInput(value ?? '');

    if (!allowEmpty && !sanitizedValue) {
      throw new Error(`${label || '입력값'}을(를) 입력해주세요.`);
    }

    if (sanitizedValue) {
      const normalized = stripSymbols(sanitizedValue.toLowerCase());
      for (const term of PROHIBITED_TERMS) {
        if (!term) continue;
        const normalizedTerm = stripSymbols(term.toLowerCase());
        if (
          normalized.includes(normalizedTerm) ||
          normalized.replace(/\s/g, '').includes(normalizedTerm.replace(/\s/g, ''))
        ) {
          throw new Error(
            `${label || '내용'}에 커뮤니티 가이드라인을 위반하는 표현이 포함되어 있습니다. 다른 표현을 사용해주세요.`,
          );
        }
      }
    }

    sanitized[targetKey] = sanitizedValue;
  });

  return sanitized;
};

export const SAFETY_POLICY_SECTIONS = [
  {
    title: '핵심 약속',
    body: `크레딧톡은 이용자 보호를 최우선으로 합니다. 우리는 신고된 불법 또는 유해한 콘텐츠와 이용자에 대해 24시간 이내에 검토 및 조치를 취합니다.`,
  },
  {
    title: '이용자 행동 수칙',
    body: `다음과 같은 콘텐츠는 절대 허용되지 않습니다.\n• 욕설, 차별, 혐오 발언\n• 성적, 폭력적, 범죄 조장 내용\n• 사기, 스팸, 허위 정보\n• 개인정보 및 사생활 침해\n위반 시 계정이 즉시 제한되며 반복 시 서비스 이용이 영구 중단됩니다.`,
  },
  {
    title: '콘텐츠 모니터링',
    body: `자동 필터링 시스템과 사람이 함께 게시물, 댓글, 채팅 메시지를 검수합니다. 필터링된 단어는 저장되지 않으며, 가이드라인을 준수하는 표현으로 수정해야만 게시할 수 있습니다.`,
  },
  {
    title: '신고 및 차단',
    body: `모든 게시물, 댓글, 메시지에서 신고 기능을 제공하며 부적절한 이용자는 즉시 차단할 수 있습니다. 신고된 내용은 최대 24시간 내에 담당자가 확인하고 필요한 경우 해당 이용자를 퇴출합니다.`,
  },
  {
    title: '안전한 커뮤니티 유지',
    body: `서비스 이용 중 불법 행위 정황이 발견될 경우 관계 기관에 즉시 협조합니다. 안전한 커뮤니티를 위해 이용자 여러분의 적극적인 신고와 협조를 부탁드립니다.`,
  },
];

export const SAFETY_POLICY_SUMMARY =
  '크레딧톡은 유해 콘텐츠에 대해 무관용 정책을 적용하며, 신고된 내용은 24시간 이내 처리됩니다.';

export const SAFETY_AGREEMENT_STORAGE_KEY =
  'credittalk:safetyAgreementAcceptedAt';

