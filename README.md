# STM32 실습실

NUCLEO-F401RE 가상 보드에서 배선하고 STM32 HAL 코드를 브라우저에서 실행해보는 입문 실습 사이트입니다.

## 레슨
1. LD2 깜빡이기 (GPIO 출력)
2. 외부 LED 연결
3. 사용자 버튼 B1 (GPIO 입력)
4. 외부 버튼 + LED
5. UART로 printf 출력
6. 가변저항 ADC 읽기
7. PWM으로 LED 밝기 (TIM3)
8. 서보모터 제어 (TIM1, 50Hz)
9. 보행자 신호등 (종합)

## 지원 범위
GPIO, HAL_Delay/HAL_GetTick, USART2 printf, ADC1 폴링, TIM3·TIM1 PWM.
C 코드는 자주 쓰는 문법만 JavaScript로 변환해 실행합니다. 인터럽트·DMA·I2C·SPI는 아직 지원하지 않습니다.

## GitHub Pages 배포
1. 이 폴더를 저장소에 올립니다.
2. 저장소 Settings → Pages → Source를 `Deploy from a branch`, 브랜치 `main` / 폴더 `/ (root)`로 선택합니다.
3. 1~2분 뒤 `https://<계정>.github.io/<저장소>/`에서 열립니다.

빌드 과정이 없는 정적 파일(index.html, style.css, js/)이라 그대로 동작합니다.
