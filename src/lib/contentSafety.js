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

  export const SAFETY_POLICY_LAST_UPDATED = '2025-10-13';

  export const SAFETY_POLICY_SECTIONS = [
    {
      title: '약관의 목적과 적용 범위',
      body: `본 커뮤니티 안전 약관(EULA)은 크레딧톡에서 게시물, 댓글, 메시지 등 사용자 생성 콘텐츠를 작성하거나 열람하는 모든 이용자에 적용되며,
안전한 커뮤니티 유지를 위해 준수해야 할 의무를 명시합니다. 약관에 동의하지 않는 경우 커뮤니티 기능을 이용할 수 없습니다.`,
    },
    {
      title: '허용되지 않는 콘텐츠와 행위 (무관용 정책)',
      body: `다음과 같은 콘텐츠 및 행위는 어떠한 예외도 없이 금지되며 위반 시 즉시 제재됩니다.\n• 욕설, 차별, 혐오 및 괴롭힘\n• 성적 착취, 폭력,
자해, 자살, 범죄 조장 내용\n• 사기, 스팸, 허위 정보, 개인정보 침해\n• 불법 행위 모의, 위협, 테러 또는 과격 행위 선동\n• 기타 타인에게 피해를 주는 모든 악용 행위`,
    },
    {
      title: '이용자 책임과 신고 의무',
      body: `이용자는 위와 같은 금지 사항을 위반하는 콘텐츠를 발견하면 즉시 신고해야 하며, 신고 기능은 게시물·댓글·메시지 등 모든 화면에서 제공됩니다.
신고된 이용자는 신고자 정보와 무관하게 자동으로 차단할 수 있으며, 신고 내용은 운영진에게 즉시 전달됩니다.`,
    },
    {
      title: '운영진의 모니터링과 제재',
      body: `자동 필터링과 전담 운영진이 24시간 이내에 신고된 콘텐츠와 이용자를 검토합니다. 위반이 확인되면 해당 콘텐츠는 즉시 삭제되고
관련 계정은 일시 정지 또는 영구 정지됩니다. 반복 위반자는 무관용 원칙에 따라 영구 퇴출되며, 필요 시 수사 기관에 적극 협조합니다.`,
    },
    {
      title: '이용 제한 및 해지',
      body: `운영진은 약관 위반 사실이 확인된 경우 사전 경고 없이 이용을 제한하거나 계약을 해지할 수 있습니다. 이용 제한 또는 해지 후에도
위법 행위에 대한 법적 책임은 면제되지 않으며, 필요 시 관련 기관에 신고될 수 있습니다.`,
    },
    {
      title: '문의 및 지원',
      body: `커뮤니티 안전과 관련된 문의는 앱 내 고객센터 또는 support@credittalk.kr로 접수할 수 있으며, 접수된 문의는 업무일 기준 24시간 이내에 답변합니다.
모든 이용자는 안전한 커뮤니티 유지를 위해 적극적으로 협력해야 합니다.`,
    },
  ];

  export const SAFETY_POLICY_SUMMARY =
    '크레딧톡은 욕설·폭력·차별 등 모든 불법·유해 콘텐츠와 악용 이용자에 대해 무관용(Zero Tolerance) 정책을 적용하며, 신고된 사항은 24시간 이내에 처리합니다.';

export const SAFETY_AGREEMENT_STORAGE_KEY =
  'credittalk:safetyAgreementAcceptedAt';

