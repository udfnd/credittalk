// scripts/gen-apple-client-secret.mjs
import { SignJWT, importPKCS8 } from 'jose';

// 환경변수에 보관하세요
const TEAM_ID     = process.env.APPLE_TEAM_ID;        // ex) AB12CDEF34
const KEY_ID      = process.env.APPLE_KEY_ID;         // ex) 1A2BC3D4EF
const SERVICES_ID = process.env.APPLE_SERVICES_ID;    // ex) com.yourorg.credittalk.web  ← "웹용 client_id"
const P8 = process.env.APPLE_PRIVATE_KEY_P8           // '-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n'
  ?.replace(/\\n/g, '\n');

if (!TEAM_ID || !KEY_ID || !SERVICES_ID || !P8) {
  throw new Error('APPLE_* 환경변수를 모두 설정하세요 (TEAM_ID, KEY_ID, SERVICES_ID, PRIVATE_KEY_P8)');
}

// Apple은 ES256(=P-256) 사용, exp는 최대 6개월까지 허용
const now = Math.floor(Date.now() / 1000);
const exp = now + 60 * 60 * 24 * 180; // 180일(~6개월) 이하로 설정

const alg = 'ES256';
const aud = 'https://appleid.apple.com';

// .p8를 키로 로드
const key = await importPKCS8(P8, alg);

// JWT(payload는 표준 클레임)
const jwt = await new SignJWT({})
  .setProtectedHeader({ alg, kid: KEY_ID })
  .setIssuer(TEAM_ID)          // iss = Team ID
  .setSubject(SERVICES_ID)     // sub = "클라이언트 ID" → **Services ID**
  .setAudience(aud)            // aud = 고정
  .setIssuedAt(now)
  .setExpirationTime(exp)
  .sign(key);

console.log(jwt);
