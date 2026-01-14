# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CreditTalk (크레딧톡) is a React Native mobile app for reporting and searching financial fraud/scam information in Korea. It helps users identify scam phone numbers, report fraud cases, and receive real-time warnings during incoming calls.

## Development Commands

```bash
# Install dependencies (uses pnpm)
pnpm install

# Start Metro bundler
pnpm start

# Run on Android
pnpm android

# Run on iOS
pnpm ios

# Run tests
pnpm test

# Lint
pnpm lint

# Format code
pnpm format

# Android debug build
cd android && ./gradlew assembleDebug

# Android release build
cd android && ./gradlew assembleRelease
```

## Architecture

### Frontend (React Native 0.79)
- **Entry**: `App.tsx` - Main navigation setup with React Navigation (native-stack + bottom-tabs)
- **Screens**: `src/screens/` - 49 screen components (Home, Report, Search, Community, HelpDesk, etc.)
- **Components**: `src/components/` - Reusable UI components
- **Context**: `src/context/AuthContext.js` - Authentication state (Supabase, Kakao, Naver, Apple login)
- **Libs**: `src/lib/` - Utilities (supabaseClient, push notifications, content safety)

### Backend (Supabase)
- **Database**: PostgreSQL with RLS, encryption for sensitive data
- **Edge Functions**: `supabase/functions/` - 20+ Deno functions for:
  - Audio analysis (`analyze-audio-file`, `trigger-audio-analysis`)
  - Push notifications (`send-fcm-v1-push`, `new-comment-notification`)
  - User management (`delete-user`, `verify-and-signup`)
  - Scam reports (`insert-scammer-report`, `get-my-decrypted-reports`)

### Android Native Modules (`android/app/src/main/java/com/credittalka/`)
- **CallStateReceiver.kt**: BroadcastReceiver for incoming call detection
  - Checks if caller is in contacts (with phone number format variations)
  - Queries scammer database via Supabase REST API
  - Shows notifications for unknown/scammer numbers
- **KeywordDetectService.kt**: Foreground service for voice phishing keyword detection
- **VoicePhishingModule.kt**: React Native bridge for native features
  - Exposes `checkPermissions()`, `isCallDetectionReady()`, `startKeywordDetection()`

### Key Permissions (Android)
- `READ_PHONE_STATE`, `READ_CALL_LOG`: Required for call detection (Android 10+)
- `READ_CONTACTS`: Contact lookup
- `POST_NOTIFICATIONS`: Push and call warnings
- `RECORD_AUDIO`, `FOREGROUND_SERVICE_MICROPHONE`: Voice analysis

## Environment Configuration

Requires `.env` file with:
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`
- Social login keys configured in `android/app/src/main/res/values/strings.xml`

## Deep Linking

- Scheme: `credittalk://`
- Routes: `credittalk://search?phoneNumber=xxx` (from call notifications)

## Testing Native Features

Call detection can be tested by:
1. Granting all permissions via app settings
2. Calling the device from an unknown number
3. Checking logcat: `adb logcat | grep CallStateReceiver`