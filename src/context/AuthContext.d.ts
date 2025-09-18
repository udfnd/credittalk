// src/context/AuthContext.d.ts

import React from 'react';
import { Session, User } from '@supabase/supabase-js';

// AuthContext가 제공하는 값들의 타입을 정의합니다.
export interface AuthContextType {
  user: User | null;
  profile: any | null; // 실제 users 테이블의 타입으로 지정하면 더 좋습니다.
  isLoading: boolean;
  setProfile: (profile: any) => void;
  supabase: any; // Supabase 클라이언트 타입
  signInWithEmail: (email, password) => Promise<any>;
  signOutUser: () => void;
  signUpWithEmail: (email, password, additionalData) => Promise<any>;
  // ✅ Apple 로그인 함수 타입 추가
  signInWithApple: (token: string) => Promise<void>;
  deleteUserAccount: () => Promise<void>;
}

// AuthContext.js 파일이 내보내는 모듈의 타입을 정의합니다.
export const AuthProvider: React.FC<{ children: React.ReactNode }>;
export function useAuth(): AuthContextType;
