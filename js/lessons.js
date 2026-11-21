// 레슨 데이터 — 부품 배치, 필수 배선, 설명, 예제 코드, 완료 조건
// 단자 id: 보드 핀은 "B:PA5", 부품 단자는 "led1:+" 형식. 보드 GND/전원은 B:GND1, B:3V3, B:5V
window.LESSONS = [
{
  id: 'blink', title: 'LD2 깜빡이기', tag: 'GPIO 출력',
  comps: [],
  wiring: [],
  goal: { text: 'LD2가 4번 이상 바뀌면 완료', check: s => s.ld2Edges >= 4 },
  overview: `
<p>보드에 달린 초록색 LED <b>LD2</b>는 <b>PA5</b> 핀에 연결돼 있어요. 배선 없이 코드만으로 깜빡여 봅니다.</p>
<h4>핵심 개념</h4>
<ul>
<li><b>클럭 활성화</b>: STM32는 주변장치 클럭이 꺼져 있어요. <code>__HAL_RCC_GPIOA_CLK_ENABLE()</code>를 먼저 호출해야 GPIOA가 동작합니다.</li>
<li><b>GPIO 초기화</b>: <code>GPIO_InitTypeDef</code> 구조체에 핀·모드를 채우고 <code>HAL_GPIO_Init()</code>로 적용합니다.</li>
<li><b>Push-Pull 출력</b>: <code>GPIO_MODE_OUTPUT_PP</code>는 HIGH(3.3V)와 LOW(0V)를 모두 직접 출력해요.</li>
</ul>
<h4>해보기</h4>
<ol><li>예제 탭에서 코드를 확인하고 <b>실행</b>을 누르세요.</li><li><code>HAL_Delay(500)</code> 값을 바꿔 속도를 바꿔보세요.</li></ol>
<h4>도전</h4>
<p><code>__HAL_RCC_GPIOA_CLK_ENABLE()</code> 줄을 지우고 실행하면 어떻게 되나요? 실제 보드에서도 똑같이 동작하지 않아요.</p>`,
  spec: [['LD2', 'PA5, HIGH일 때 켜짐'], ['PA5 다른 기능', 'SPI1_SCK, Arduino D13'], ['출력 모드', 'Push-Pull / Open-Drain'], ['HAL_Delay 기준', 'SysTick 1ms']],
  code: `#include "main.h"

void MX_GPIO_Init(void);

int main(void)
{
  HAL_Init();
  SystemClock_Config();
  MX_GPIO_Init();

  while (1)
  {
    HAL_GPIO_TogglePin(GPIOA, GPIO_PIN_5);  // LD2(PA5) 상태 반전
    HAL_Delay(500);                          // 500ms 대기
  }
}

void MX_GPIO_Init(void)
{
  GPIO_InitTypeDef GPIO_InitStruct = {0};

  __HAL_RCC_GPIOA_CLK_ENABLE();             // GPIOA 클럭 켜기

  GPIO_InitStruct.Pin = GPIO_PIN_5;
  GPIO_InitStruct.Mode = GPIO_MODE_OUTPUT_PP;
  GPIO_InitStruct.Pull = GPIO_NOPULL;
  GPIO_InitStruct.Speed = GPIO_SPEED_FREQ_LOW;
  HAL_GPIO_Init(GPIOA, &GPIO_InitStruct);
}
`
},
{
  id: 'ext-led', title: '외부 LED 연결', tag: 'GPIO 출력 · 배선',
  comps: [{ id: 'led1', type: 'led', color: 'red', name: 'LED 빨강', x: 600, y: 250 }],
  wiring: [['B:PB5', 'led1:+'], ['led1:-', 'B:GND1']],
  goal: { text: '배선을 맞게 하고 LED가 4번 이상 깜빡이면 완료', check: s => s.ledEdges.led1 >= 4 },
  overview: `
<p>저항이 내장된 LED 모듈을 <b>D4(PB5)</b>에 연결합니다. 보드 밖 부품을 다루는 첫 단계예요.</p>
<h4>배선 방법</h4>
<ol><li>부품이나 보드의 핀(동그라미)을 누르고, 연결할 다른 핀을 누르면 전선이 생겨요.</li><li>전선을 누르면 삭제됩니다. <kbd>Esc</kbd>로 선택을 취소해요.</li></ol>
<h4>핵심 개념</h4>
<ul>
<li>LED는 방향이 있어요. 긴 다리(<b>+</b>, 애노드)를 핀에, 짧은 다리(<b>−</b>, 캐소드)를 GND에 연결합니다.</li>
<li>실제 LED에는 220Ω~1kΩ 저항을 직렬로 꼭 넣어야 해요. 이 모듈은 저항이 내장돼 있습니다.</li>
<li>STM32 핀 하나의 출력 전류는 최대 25mA예요. 큰 부하는 트랜지스터로 구동합니다.</li>
</ul>
<h4>도전</h4>
<p>LED 다리를 거꾸로 연결해 보세요. 왜 켜지지 않을까요?</p>`,
  spec: [['D4', 'PB5 (TIM3_CH2 가능)'], ['핀당 최대 전류', '±25mA'], ['출력 HIGH 전압', '약 3.3V'], ['LED 모듈', '저항 내장, +/− 2핀']],
  code: `#include "main.h"

#define LED_PORT  GPIOB
#define LED_PIN   GPIO_PIN_5   // D4

void MX_GPIO_Init(void);

int main(void)
{
  HAL_Init();
  SystemClock_Config();
  MX_GPIO_Init();

  while (1)
  {
    HAL_GPIO_WritePin(LED_PORT, LED_PIN, GPIO_PIN_SET);    // 켜기
    HAL_Delay(300);
    HAL_GPIO_WritePin(LED_PORT, LED_PIN, GPIO_PIN_RESET);  // 끄기
    HAL_Delay(300);
  }
}

void MX_GPIO_Init(void)
{
  GPIO_InitTypeDef GPIO_InitStruct = {0};

  __HAL_RCC_GPIOB_CLK_ENABLE();

  GPIO_InitStruct.Pin = LED_PIN;
  GPIO_InitStruct.Mode = GPIO_MODE_OUTPUT_PP;
  GPIO_InitStruct.Pull = GPIO_NOPULL;
  GPIO_InitStruct.Speed = GPIO_SPEED_FREQ_LOW;
  HAL_GPIO_Init(LED_PORT, &GPIO_InitStruct);
}
`
},
{
  id: 'user-button', title: '사용자 버튼 B1', tag: 'GPIO 입력',
  comps: [],
  wiring: [],
  goal: { text: 'B1을 눌러 LD2를 2번 이상 바꾸면 완료', check: s => s.reactive >= 2 && s.presses >= 1 },
  overview: `
<p>보드의 파란 버튼 <b>B1</b>은 <b>PC13</b>에 연결돼 있어요. 누르는 동안 LD2를 켜봅니다.</p>
<h4>핵심 개념</h4>
<ul>
<li><b>Active-Low</b>: B1은 보드에 풀업 저항이 있어 평소 HIGH(1), 누르면 LOW(0)를 읽어요.</li>
<li><code>HAL_GPIO_ReadPin()</code>은 <code>GPIO_PIN_SET</code>(1) 또는 <code>GPIO_PIN_RESET</code>(0)을 돌려줍니다.</li>
<li>입력 모드에서는 <code>Pull</code> 설정으로 내부 풀업/풀다운을 고를 수 있어요.</li>
</ul>
<h4>해보기</h4>
<ol><li>실행 후 보드의 파란 <b>B1</b> 버튼을 누르고 있어 보세요.</li><li>검은 <b>B2</b>(RESET)를 누르면 프로그램이 처음부터 다시 시작해요.</li></ol>
<h4>도전</h4>
<p>누를 때마다 LD2가 토글되도록 바꿔보세요. 이전 상태를 변수에 저장해 <b>눌린 순간(엣지)</b>만 감지하면 됩니다.</p>`,
  spec: [['B1 USER', 'PC13, 누르면 LOW'], ['B2 RESET', 'NRST, MCU 리셋'], ['입력 풀업/풀다운', '약 40kΩ 내장'], ['읽기 함수', 'HAL_GPIO_ReadPin()']],
  code: `#include "main.h"

void MX_GPIO_Init(void);

int main(void)
{
  HAL_Init();
  SystemClock_Config();
  MX_GPIO_Init();

  while (1)
  {
    // B1은 Active-Low: 누르면 GPIO_PIN_RESET
    if (HAL_GPIO_ReadPin(B1_GPIO_Port, B1_Pin) == GPIO_PIN_RESET)
    {
      HAL_GPIO_WritePin(LD2_GPIO_Port, LD2_Pin, GPIO_PIN_SET);
    }
    else
    {
      HAL_GPIO_WritePin(LD2_GPIO_Port, LD2_Pin, GPIO_PIN_RESET);
    }
  }
}

void MX_GPIO_Init(void)
{
  GPIO_InitTypeDef GPIO_InitStruct = {0};

  __HAL_RCC_GPIOA_CLK_ENABLE();
  __HAL_RCC_GPIOC_CLK_ENABLE();

  // LD2 (PA5) 출력
  GPIO_InitStruct.Pin = LD2_Pin;
  GPIO_InitStruct.Mode = GPIO_MODE_OUTPUT_PP;
  GPIO_InitStruct.Pull = GPIO_NOPULL;
  HAL_GPIO_Init(LD2_GPIO_Port, &GPIO_InitStruct);

  // B1 (PC13) 입력
  GPIO_InitStruct.Pin = B1_Pin;
  GPIO_InitStruct.Mode = GPIO_MODE_INPUT;
  GPIO_InitStruct.Pull = GPIO_NOPULL;      // 보드에 풀업 저항 있음
  HAL_GPIO_Init(B1_GPIO_Port, &GPIO_InitStruct);
}
`
},
{
  id: 'ext-button', title: '외부 버튼 + LED', tag: 'GPIO 입력 · 배선',
  comps: [
    { id: 'btn1', type: 'button', name: '버튼 모듈', x: 500, y: 300 },
    { id: 'led1', type: 'led', color: 'green', name: 'LED 초록', x: 760, y: 250 }
  ],
  wiring: [['btn1:S', 'B:PA10'], ['btn1:+', 'B:3V3'], ['btn1:-', 'B:GND1'], ['led1:+', 'B:PB5'], ['led1:-', 'B:GND1']],
  goal: { text: '버튼으로 LED를 2번 이상 바꾸면 완료', check: s => s.reactive >= 2 && s.presses >= 1 && s.ledEdges.led1 >= 2 },
  overview: `
<p>버튼 모듈을 <b>D2(PA10)</b>에, LED를 <b>D4(PB5)</b>에 연결해 버튼으로 LED를 켭니다.</p>
<h4>핵심 개념</h4>
<ul>
<li>버튼 모듈의 <b>S</b>는 누르면 HIGH, 떼면 LOW예요 (모듈에 풀다운 저항 내장).</li>
<li>모듈은 전원이 필요해요. <b>+</b>는 3V3, <b>−</b>는 GND에 연결합니다. 5V를 쓰면 S 출력도 5V가 돼서 일반 핀에 무리가 갈 수 있어요.</li>
<li>전원이 없으면 S가 떠 있는(floating) 상태가 되어 값이 불안정해요. 그래서 MCU 내부 풀다운(<code>GPIO_PULLDOWN</code>)을 함께 설정합니다.</li>
</ul>
<h4>도전</h4>
<p>버튼을 누를 때마다 LED가 토글되게 바꾸고, 채터링(바운스)을 막기 위해 20ms 디바운스를 넣어보세요.</p>`,
  spec: [['D2', 'PA10 (USART1_RX 겸용)'], ['D4', 'PB5'], ['버튼 모듈', 'S / + / −, 누르면 S=HIGH'], ['권장 전원', '3V3']],
  code: `#include "main.h"

void MX_GPIO_Init(void);

int main(void)
{
  HAL_Init();
  SystemClock_Config();
  MX_GPIO_Init();

  while (1)
  {
    GPIO_PinState btn = HAL_GPIO_ReadPin(GPIOA, GPIO_PIN_10);  // D2
    HAL_GPIO_WritePin(GPIOB, GPIO_PIN_5, btn);                 // D4 LED
  }
}

void MX_GPIO_Init(void)
{
  GPIO_InitTypeDef GPIO_InitStruct = {0};

  __HAL_RCC_GPIOA_CLK_ENABLE();
  __HAL_RCC_GPIOB_CLK_ENABLE();

  // 버튼 입력: PA10, 내부 풀다운
  GPIO_InitStruct.Pin = GPIO_PIN_10;
  GPIO_InitStruct.Mode = GPIO_MODE_INPUT;
  GPIO_InitStruct.Pull = GPIO_PULLDOWN;
  HAL_GPIO_Init(GPIOA, &GPIO_InitStruct);

  // LED 출력: PB5
  GPIO_InitStruct.Pin = GPIO_PIN_5;
  GPIO_InitStruct.Mode = GPIO_MODE_OUTPUT_PP;
  GPIO_InitStruct.Pull = GPIO_NOPULL;
  HAL_GPIO_Init(GPIOB, &GPIO_InitStruct);
}
`
},
{
  id: 'uart', title: 'UART로 printf 출력', tag: 'USART2 · 시리얼',
  comps: [],
  wiring: [],
  goal: { text: '시리얼 모니터에 3줄 이상 출력되면 완료', check: s => s.serialLines >= 3 },
  overview: `
<p>Nucleo의 <b>USART2</b>(PA2/PA3)는 ST-LINK를 거쳐 USB 가상 COM 포트로 PC에 연결돼 있어요. 아래 시리얼 모니터에서 출력을 확인합니다.</p>
<h4>핵심 개념</h4>
<ul>
<li><code>HAL_UART_Transmit(&amp;huart2, 버퍼, 길이, 타임아웃)</code>으로 바이트를 보냅니다.</li>
<li>실제 보드에서 <code>printf</code>를 쓰려면 <code>__io_putchar()</code>나 <code>_write()</code>를 UART로 연결(retarget)해야 해요. 이 실습실은 그 과정이 이미 된 상태입니다.</li>
<li>줄바꿈은 <code>\\r\\n</code>을 쓰는 게 일반적이에요.</li>
</ul>
<h4>실제 보드용 retarget 코드</h4>
<pre class="snip">int __io_putchar(int ch)
{
  HAL_UART_Transmit(&amp;huart2, (uint8_t *)&amp;ch, 1, HAL_MAX_DELAY);
  return ch;
}</pre>
<h4>도전</h4>
<p><code>sprintf</code>로 문자열을 만든 뒤 <code>HAL_UART_Transmit</code>으로 직접 보내보세요.</p>`,
  spec: [['USART2 TX/RX', 'PA2 (D1) / PA3 (D0)'], ['연결', 'ST-LINK 가상 COM 포트'], ['설정', '115200 bps, 8N1'], ['HAL_GetTick()', '부팅 후 경과 ms']],
  code: `#include "main.h"
#include <stdio.h>
#include <string.h>

int main(void)
{
  HAL_Init();
  SystemClock_Config();
  MX_USART2_UART_Init();      // 115200 8N1

  char msg[64];
  int count = 0;

  sprintf(msg, "Hello, STM32F401!\\r\\n");
  HAL_UART_Transmit(&huart2, (uint8_t *)msg, strlen(msg), HAL_MAX_DELAY);

  while (1)
  {
    printf("count=%d  tick=%lu ms\\r\\n", count, HAL_GetTick());
    count++;
    HAL_Delay(1000);
  }
}
`
},
{
  id: 'adc', title: '가변저항 ADC 읽기', tag: 'ADC1 · 아날로그',
  comps: [{ id: 'pot1', type: 'pot', name: '가변저항', x: 600, y: 280 }],
  wiring: [['pot1:+', 'B:3V3'], ['pot1:S', 'B:PA0'], ['pot1:-', 'B:GND1']],
  goal: { text: '노브를 돌려 서로 다른 값 4개 이상 읽으면 완료', check: s => s.adcValues.size >= 4 },
  overview: `
<p>가변저항의 가운데 단자(<b>S</b>)를 <b>A0(PA0)</b>에 연결하고, 12비트 ADC로 전압을 읽어요. 노브를 마우스로 끌어서 돌려보세요.</p>
<h4>핵심 개념</h4>
<ul>
<li><b>12비트 ADC</b>: 0~3.3V를 0~4095로 바꿔요. 전압(mV) = 값 × 3300 / 4095.</li>
<li>폴링 방식: <code>HAL_ADC_Start</code> → <code>HAL_ADC_PollForConversion</code> → <code>HAL_ADC_GetValue</code>.</li>
<li>ADC 입력에 3.3V보다 높은 전압을 넣으면 안 돼요. 가변저항 +는 반드시 <b>3V3</b>에 연결하세요.</li>
<li>이 실습실에서 <code>MX_ADC1_Init()</code>은 CubeMX가 만든 초기화 코드처럼 PA0(채널 0)을 설정해요.</li>
</ul>
<h4>도전</h4>
<p>ADC 값으로 LD2 깜빡임 속도를 바꿔보세요.</p>`,
  spec: [['A0', 'PA0 = ADC1_IN0'], ['분해능', '12bit (0~4095)'], ['기준 전압', 'VDDA = 3.3V'], ['채널 수', '외부 16채널']],
  code: `#include "main.h"
#include <stdio.h>

int main(void)
{
  HAL_Init();
  SystemClock_Config();
  MX_USART2_UART_Init();
  MX_ADC1_Init();             // PA0 = ADC1 채널 0

  while (1)
  {
    HAL_ADC_Start(&hadc1);
    HAL_ADC_PollForConversion(&hadc1, 10);
    uint32_t raw = HAL_ADC_GetValue(&hadc1);
    HAL_ADC_Stop(&hadc1);

    uint32_t mv = raw * 3300 / 4095;
    printf("ADC=%4lu  전압=%4lu mV\\r\\n", raw, mv);
    HAL_Delay(200);
  }
}
`
},
{
  id: 'pwm', title: 'PWM으로 LED 밝기', tag: 'TIM3 · PWM',
  comps: [{ id: 'led1', type: 'led', color: 'yellow', name: 'LED 노랑', x: 620, y: 250 }],
  wiring: [['led1:+', 'B:PA6'], ['led1:-', 'B:GND1']],
  goal: { text: 'LED 밝기가 5단계 이상 바뀌면 완료', check: s => s.ledLevels.led1 && s.ledLevels.led1.size >= 5 },
  overview: `
<p><b>D12(PA6)</b>는 <b>TIM3 채널 1</b>로 PWM을 낼 수 있어요. 듀티비를 바꿔 LED가 서서히 밝아지고 어두워지게 합니다.</p>
<h4>핵심 개념</h4>
<ul>
<li><b>PWM 주파수</b> = 타이머 클럭 / (PSC+1) / (ARR+1). 84MHz / 84 / 1000 = <b>1kHz</b>.</li>
<li><b>듀티비</b> = CCR / (ARR+1). <code>__HAL_TIM_SET_COMPARE()</code>로 CCR 값을 바꿉니다.</li>
<li>핀은 GPIO가 아닌 <b>대체 기능(AF2, TIM3)</b> 모드로 설정돼요. <code>MX_TIM3_Init()</code>이 처리합니다.</li>
</ul>
<h4>도전</h4>
<p>밝기 변화가 사람 눈에 자연스럽도록 듀티를 제곱 곡선으로 바꿔보세요.</p>`,
  spec: [['D12', 'PA6 = TIM3_CH1 (AF2)'], ['TIM3 클럭', '84MHz (APB1 ×2)'], ['PSC / ARR', '83 / 999 → 1kHz'], ['CCR 범위', '0 ~ 999']],
  code: `#include "main.h"

int main(void)
{
  HAL_Init();
  SystemClock_Config();
  MX_TIM3_Init();                              // PSC=83, ARR=999 → 1kHz

  HAL_TIM_PWM_Start(&htim3, TIM_CHANNEL_1);   // PA6 PWM 시작

  while (1)
  {
    for (int duty = 0; duty <= 999; duty += 20)     // 밝아지기
    {
      __HAL_TIM_SET_COMPARE(&htim3, TIM_CHANNEL_1, duty);
      HAL_Delay(15);
    }
    for (int duty = 999; duty >= 0; duty -= 20)     // 어두워지기
    {
      __HAL_TIM_SET_COMPARE(&htim3, TIM_CHANNEL_1, duty);
      HAL_Delay(15);
    }
  }
}
`
},
{
  id: 'servo', title: '서보모터 제어', tag: 'TIM1 · 50Hz PWM',
  comps: [{ id: 'servo1', type: 'servo', name: '서보 SG90', x: 580, y: 250 }],
  wiring: [['servo1:S', 'B:PA8'], ['servo1:+', 'B:5V'], ['servo1:-', 'B:GND1']],
  goal: { text: '서보를 0° 근처와 180° 근처까지 움직이면 완료', check: s => s.servoMin <= 20 && s.servoMax >= 160 },
  overview: `
<p>서보모터는 <b>50Hz(20ms 주기)</b> 펄스의 폭으로 각도를 정해요. <b>D7(PA8)</b>의 <b>TIM1 채널 1</b>을 씁니다.</p>
<h4>핵심 개념</h4>
<ul>
<li>펄스 폭 0.5ms → 0°, 1.5ms → 90°, 2.5ms → 180° (SG90 기준, 제품마다 조금 달라요).</li>
<li>TIM1을 1MHz(1µs 단위)로 세고 ARR=19999로 두면 CCR 값이 곧 펄스 폭(µs)이 돼요.</li>
<li>서보 전원은 <b>5V</b>, 신호선은 3.3V 로직으로도 대부분 동작합니다. 실제로는 서보 전류가 커서 별도 전원을 권장해요.</li>
<li>TIM1은 고급 타이머라 PWM 출력에 <b>MOE</b> 비트가 필요해요. HAL_TIM_PWM_Start가 켜줍니다.</li>
</ul>
<h4>도전</h4>
<p>가변저항 값(ADC)으로 서보 각도를 조절해보세요. 레슨 6 배선을 함께 쓰면 됩니다.</p>`,
  spec: [['D7', 'PA8 = TIM1_CH1 (AF1)'], ['TIM1 클럭', '84MHz (APB2)'], ['PSC / ARR', '83 / 19999 → 50Hz'], ['서보 선 색', '주황=신호, 빨강=+, 갈색=−']],
  code: `#include "main.h"

uint32_t angle_to_pulse(int angle)
{
  return 500 + angle * 2000 / 180;   // 0°=500us, 180°=2500us
}

int main(void)
{
  HAL_Init();
  SystemClock_Config();
  MX_TIM1_Init();                              // 1us 단위, 20ms 주기

  HAL_TIM_PWM_Start(&htim1, TIM_CHANNEL_1);   // PA8

  int angles[3] = {0, 90, 180};

  while (1)
  {
    for (int i = 0; i < 3; i++)
    {
      __HAL_TIM_SET_COMPARE(&htim1, TIM_CHANNEL_1, angle_to_pulse(angles[i]));
      HAL_Delay(1000);
    }
  }
}
`
},
{
  id: 'traffic', title: '보행자 신호등', tag: '종합 프로젝트',
  comps: [
    { id: 'ledR', type: 'led', color: 'red', name: '빨강', x: 480, y: 130 },
    { id: 'ledY', type: 'led', color: 'yellow', name: '노랑', x: 620, y: 130 },
    { id: 'ledG', type: 'led', color: 'green', name: '초록', x: 760, y: 130 },
    { id: 'btn1', type: 'button', name: '보행자 버튼', x: 600, y: 420 }
  ],
  wiring: [
    ['ledR:+', 'B:PB5'], ['ledY:+', 'B:PB4'], ['ledG:+', 'B:PB10'],
    ['ledR:-', 'B:GND1'], ['ledY:-', 'B:GND1'], ['ledG:-', 'B:GND1'],
    ['btn1:S', 'B:PA10'], ['btn1:+', 'B:3V3'], ['btn1:-', 'B:GND1']
  ],
  goal: { text: '버튼을 눌러 빨강·노랑·초록이 모두 한 번씩 켜지면 완료', check: s => s.presses >= 1 && s.ledEdges.ledR >= 1 && s.ledEdges.ledY >= 1 && s.ledEdges.ledG >= 1 },
  overview: `
<p>차량 신호등 3색 LED와 보행자 버튼을 연결합니다. 평소엔 초록불, 버튼을 누르면 노랑 → 빨강으로 바뀌고 일정 시간 뒤 초록으로 돌아와요.</p>
<h4>배선</h4>
<ul><li>빨강 → <b>D4(PB5)</b>, 노랑 → <b>D5(PB4)</b>, 초록 → <b>D6(PB10)</b></li><li>버튼 S → <b>D2(PA10)</b>, + → 3V3, − → GND</li><li>GND가 여러 개 필요하면 같은 GND 핀에 여러 선을 연결해도 돼요.</li></ul>
<h4>핵심 개념</h4>
<ul>
<li><b>상태 기계</b>: 현재 상태(초록/노랑/빨강)를 변수로 두고 조건에 따라 다음 상태로 넘어가요.</li>
<li>여러 핀을 한 번에 초기화할 때 <code>GPIO_PIN_4 | GPIO_PIN_5</code>처럼 OR로 묶을 수 있어요.</li>
</ul>
<h4>도전</h4>
<p>빨강불 동안 남은 시간을 시리얼로 출력하고, 마지막 2초는 초록 LED를 깜빡이게 해보세요.</p>`,
  spec: [['빨강 / 노랑 / 초록', 'PB5 / PB4 / PB10'], ['버튼', 'PA10, 누르면 HIGH'], ['상태 수', '3 (초록·노랑·빨강)'], ['시리얼', 'USART2 115200']],
  code: `#include "main.h"
#include <stdio.h>

#define RED     GPIO_PIN_5    // PB5  (D4)
#define YELLOW  GPIO_PIN_4    // PB4  (D5)
#define GREEN   GPIO_PIN_10   // PB10 (D6)

void MX_GPIO_Init(void);

void set_light(uint16_t pin)
{
  HAL_GPIO_WritePin(GPIOB, RED | YELLOW | GREEN, GPIO_PIN_RESET);
  HAL_GPIO_WritePin(GPIOB, pin, GPIO_PIN_SET);
}

int main(void)
{
  HAL_Init();
  SystemClock_Config();
  MX_GPIO_Init();
  MX_USART2_UART_Init();

  set_light(GREEN);
  printf("차량 초록불\\r\\n");

  while (1)
  {
    if (HAL_GPIO_ReadPin(GPIOA, GPIO_PIN_10) == GPIO_PIN_SET)
    {
      printf("보행자 요청!\\r\\n");
      set_light(YELLOW);
      HAL_Delay(1000);

      set_light(RED);
      printf("보행자 건너세요 (3초)\\r\\n");
      HAL_Delay(3000);

      set_light(GREEN);
      printf("차량 초록불\\r\\n");
    }
  }
}

void MX_GPIO_Init(void)
{
  GPIO_InitTypeDef GPIO_InitStruct = {0};

  __HAL_RCC_GPIOA_CLK_ENABLE();
  __HAL_RCC_GPIOB_CLK_ENABLE();

  GPIO_InitStruct.Pin = RED | YELLOW | GREEN;
  GPIO_InitStruct.Mode = GPIO_MODE_OUTPUT_PP;
  GPIO_InitStruct.Pull = GPIO_NOPULL;
  HAL_GPIO_Init(GPIOB, &GPIO_InitStruct);

  GPIO_InitStruct.Pin = GPIO_PIN_10;
  GPIO_InitStruct.Mode = GPIO_MODE_INPUT;
  GPIO_InitStruct.Pull = GPIO_PULLDOWN;
  HAL_GPIO_Init(GPIOA, &GPIO_InitStruct);
}
`
}
];
