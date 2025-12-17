package com.credittalka

import android.app.*
import android.content.Intent
import android.os.*
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.util.Log
import androidx.core.app.NotificationCompat

class KeywordDetectService : Service(), RecognitionListener {

    private lateinit var recognizer: SpeechRecognizer
    private lateinit var recogIntent: Intent

    private val keywords = listOf(
        "압수수색", "압수수색영장", "영장발부", "압수", "도주우려", "증거인멸우려",
        "긴급체포", "체포영장", "구속영장", "범죄수익금", "불법대출", "금감원",
        "금융위원회", "수사관", "경찰", "경찰청", "국세청", "캐피탈", "대출회사",
        "은행", "원금보장", "국가계좌", "안전계좌", "돈을 옮겨놓으세요", "기소중지",
        "수배자", "용의자", "아무에게도 말하면 안됩니다", "폰지사기", "투자사기",
        "코인 올라간다", "주식 올라간다", "비상장주식", "상장된다", "개인정보유출",
        "직원에게 돈 전달하세요", "계좌임대", "대출작업", "신용작업", "한도 올려서",
        "작대", "감금", "명의도용", "통장대여", "계좌대여", "통장양도", "계좌양도",
        "체크카드 만들어 주세요", "체크카드 보내주세요", "계좌 만들어주세요", "유심 만들어주세요",
        "유심 삽니다", "핸드폰 만들어주세요", "검거", "작업대출", "검찰청", "도박사이트",
        "환전", "바카라", "토토", "돈세탁", "중고나라사기검거", "보이스피싱검거", "대포통장",
        "대포폰", "죽인다", "죽여줄게", "개인돈", "일수", "불법사금융", "추심", "연장비",
        "저금리대출", "대환대출", "대출상환", "돈전달", "금융거래법위반", "전자금융거래법위반",
        "납치", "싼 이자", "범죄조직", "범죄활동", "범행계좌", "쇼핑몰주문서작성알바", "장집",
        "장주", "핑돈", "성매매", "영상 퍼뜨리겠다", "현김수거책", "고수익알바", "통장 잠군다",
        "계좌 묶는다", "계좌 잠궈줄게", "통장 잠궈줄게", "선불유심매입", "계좌매입",
        "통장매입", "사진뿌린다", "Hi", "Voice", "Voice fishing", "GyeongChal", "GyeongChalCheong"
    )

    override fun onCreate() {
        super.onCreate()

        createNotificationChannel()

        val notification = NotificationCompat.Builder(this, "CHANNEL_ID")
            .setContentTitle("음성 인식 서비스 실행 중")
            .setContentText("보이스피싱 키워드 감지 중입니다.")
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .build()

        startForeground(1, notification)

        setupSpeechRecognizer()
        recognizer.startListening(recogIntent)
    }

    private fun setupSpeechRecognizer() {
        recognizer = SpeechRecognizer.createSpeechRecognizer(this)
        recognizer.setRecognitionListener(this)

        recogIntent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, "ko-KR")
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
        }
    }

    override fun onDestroy() {
        recognizer.destroy()
        super.onDestroy()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int) = START_STICKY

    private fun createNotificationChannel() {
        val channel = NotificationChannel(
            "CHANNEL_ID", "Keyword Detection Channel",
            NotificationManager.IMPORTANCE_LOW
        )
        getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }

    override fun onReadyForSpeech(params: Bundle?) {}
    override fun onBeginningOfSpeech() {}
    override fun onRmsChanged(rmsdB: Float) {}
    override fun onBufferReceived(buffer: ByteArray?) {}
    override fun onEndOfSpeech() {}
    override fun onEvent(eventType: Int, params: Bundle?) {}
    override fun onError(error: Int) {
        recognizer.startListening(recogIntent)
    }

    override fun onPartialResults(partialResults: Bundle?) {
        val matches = partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
        matches?.joinToString(" ")?.let { checkKeyword(it) }
    }

    override fun onResults(results: Bundle?) {
        val matches = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
        matches?.joinToString(" ")?.let { checkKeyword(it) }
        recognizer.startListening(recogIntent)
    }

    private fun checkKeyword(text: String) {
        if (keywords.any { text.contains(it) }) {
            vibrate3Sec()
            pushAlert()
        }
    }

    private fun vibrate3Sec() {
        val vib = getSystemService(VIBRATOR_SERVICE) as Vibrator
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
            vib.vibrate(VibrationEffect.createOneShot(3000, VibrationEffect.DEFAULT_AMPLITUDE))
        else vib.vibrate(3000)
    }

    private fun pushAlert() {
        val chId = "KD_ALERT"
        val nm = getSystemService(NotificationManager::class.java)

        if (nm.getNotificationChannel(chId) == null)
            nm.createNotificationChannel(
                NotificationChannel(chId, "보이스피싱 경고", NotificationManager.IMPORTANCE_HIGH)
            )

        nm.notify(System.currentTimeMillis().toInt(),
            Notification.Builder(this, chId)
                .setSmallIcon(android.R.drawable.stat_notify_error)
                .setContentTitle("보이스피싱 키워드가 감지되었습니다.")
                .setContentText("통화 중 위험 키워드가 탐지되었습니다.")
                .setAutoCancel(true)
                .build())
    }

    override fun onBind(intent: Intent?) = null
}
