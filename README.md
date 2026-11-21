# STM32 실습실

NUCLEO-F401RE 가상 보드를 3D 작업대에 놓고, 부품에 점퍼선을 꽂고, STM32 HAL C 코드를 브라우저에서 바로 실행해보는 실습 사이트입니다.

- 3D 작업대: three.js, 보드는 실측 치수(70 × 82.5mm, Arduino Uno V3 헤더 + ST morpho)로 모델링
- 조작: 드래그 회전 · 우클릭 드래그 이동 · 휠 확대 · W A S D 이동 · Q E 회전
- 부품 15종: LED, RGB LED, 버튼, 가변저항, 부저, DHT11, 7세그먼트, OLED, HC-SR04, 서보, 릴레이+램프, LCD 16x2, 스텝 모터, DC 모터(L298N+엔코더), BLDC+ESC

## 레슨 (26개 + 자유 실습)
- GPIO 기초: LD2 깜빡이기, 외부 LED, B1 버튼, 외부 버튼, EXTI 인터럽트
- 타이머·PWM: 타이머 주기 인터럽트, PWM 밝기, RGB LED, 부저 멜로디
- 통신: UART 송신, UART 명령 수신, I2C LCD, OLED
- 센서·표시: ADC, 초음파, DHT11, 7세그먼트
- 모터 제어: 릴레이, 서보, 스텝 모터, DC 모터, 엔코더, PID 속도 제어, PID 위치 제어, BLDC+ESC
- 종합: 보행자 신호등, 자유 실습

## 지원 범위
GPIO, EXTI, SysTick, USART2 송수신(폴링·인터럽트), ADC1, TIM PWM·엔코더·주기 인터럽트·µs 카운터, I2C(LCD·OLED), DHT11 드라이버.
DMA, SPI, RTC, 저전력 모드, 워치독은 아직 없습니다. C 코드는 자주 쓰는 문법만 JavaScript로 변환해 실행합니다.

## 라이선스
- three.js (MIT) — `vendor/three-LICENSE`

## GitHub Pages 배포
1. 이 폴더를 저장소에 올립니다.
2. 저장소 Settings → Pages → Source를 `Deploy from a branch`, 브랜치 `main` / 폴더 `/ (root)`로 선택합니다.
3. 1~2분 뒤 `https://<계정>.github.io/<저장소>/`에서 열립니다.

빌드 과정이 없는 정적 파일(index.html, style.css, js/, vendor/)이라 그대로 동작합니다. ES 모듈을 쓰므로 로컬에서 볼 때는 `python -m http.server`처럼 간단한 서버로 여세요.
