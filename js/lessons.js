// 레슨 데이터 — 부품 배치, 필수 배선, 설명, 예제 코드, 완료 조건
// 단자 id: 보드 핀은 "B:PA5", 부품 단자는 "부품id:단자" (예: led1:+). 보드 GND는 B:GND1/2/3 중 아무거나 같은 넷.
(function () {
const S1 = 'GPIO 기초', S2 = '타이머 · PWM', S3 = '통신', S4 = '센서 · 표시', S5 = '모터 제어', S6 = '종합';
const G = 'B:GND1';

window.LESSONS = [
/* ================= GPIO 기초 ================= */
{
  id: 'blink', sec: S1, title: 'LD2 깜빡이기', tag: 'GPIO 출력',
  comps: [], wiring: [],
  goal: { text: 'LD2가 4번 이상 바뀌면 완료', check: s => s.ld2Edges >= 4 },
  overview: `
<p>보드에 달린 초록색 LED <b>LD2</b>는 <b>PA5</b> 핀에 연결돼 있어요. 배선 없이 코드만으로 깜빡여 봅니다.</p>
<h4>핵심 개념</h4>
<ul>
<li><b>클럭 활성화</b>: STM32는 주변장치 클럭이 꺼져 있어요. <code>__HAL_RCC_GPIOA_CLK_ENABLE()</code>를 먼저 호출해야 GPIOA가 동작합니다.</li>
<li><b>GPIO 초기화</b>: <code>GPIO_InitTypeDef</code> 구조체에 핀·모드를 채우고 <code>HAL_GPIO_Init()</code>로 적용합니다.</li>
<li><b>Push-Pull 출력</b>: <code>GPIO_MODE_OUTPUT_PP</code>는 HIGH(3.3V)와 LOW(0V)를 모두 직접 출력해요.</li>
</ul>
<h4>도전</h4>
<p><code>__HAL_RCC_GPIOA_CLK_ENABLE()</code> 줄을 지우고 실행해보세요. 실제 보드에서도 똑같이 동작하지 않아요.</p>`,
  spec: [['LD2', 'PA5, HIGH일 때 켜짐'], ['PA5 다른 기능', 'SPI1_SCK, Arduino D13'], ['HAL_Delay 기준', 'SysTick 1ms']],
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
  id: 'ext-led', sec: S1, title: '외부 LED 연결', tag: 'GPIO 출력 · 배선',
  comps: [{ id: 'led1', type: 'led', color: 'red', name: 'LED 빨강', x: 600, y: 250 }],
  wiring: [['B:PB5', 'led1:+'], ['led1:-', G]],
  goal: { text: '배선을 맞게 하고 LED가 4번 이상 깜빡이면 완료', check: s => s.ledEdges.led1 >= 4 },
  overview: `
<p>저항이 내장된 LED 모듈을 <b>D4(PB5)</b>에 연결합니다.</p>
<h4>배선 방법</h4>
<ol><li>부품이나 보드의 핀(동그라미)을 누르고, 연결할 다른 핀을 누르면 전선이 생겨요.</li><li>전선을 누르면 삭제됩니다. <kbd>Esc</kbd>로 선택을 취소해요. 부품 몸체를 끌면 옮겨져요.</li></ol>
<h4>핵심 개념</h4>
<ul>
<li>LED는 방향이 있어요. 긴 다리(<b>+</b>, 애노드)를 핀에, 짧은 다리(<b>−</b>, 캐소드)를 GND에 연결합니다.</li>
<li>실제 LED에는 220Ω~1kΩ 저항을 직렬로 꼭 넣어야 해요. 이 모듈은 저항이 내장돼 있습니다.</li>
<li>STM32 핀 하나의 출력 전류는 최대 25mA예요. 큰 부하는 트랜지스터나 릴레이로 구동합니다.</li>
</ul>`,
  spec: [['D4', 'PB5'], ['핀당 최대 전류', '±25mA'], ['LED 모듈', '저항 내장, +/− 2핀']],
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
  HAL_GPIO_Init(LED_PORT, &GPIO_InitStruct);
}
`
},
{
  id: 'user-button', sec: S1, title: '사용자 버튼 B1', tag: 'GPIO 입력 · 폴링',
  comps: [], wiring: [],
  goal: { text: 'B1을 눌러 LD2를 2번 이상 바꾸면 완료', check: s => s.reactive >= 2 && s.presses >= 1 },
  overview: `
<p>보드의 파란 버튼 <b>B1</b>은 <b>PC13</b>에 연결돼 있어요. 누르는 동안 LD2를 켭니다. 반복문에서 계속 핀을 읽는 방식을 <b>폴링</b>이라고 해요.</p>
<h4>핵심 개념</h4>
<ul>
<li><b>Active-Low</b>: B1은 보드에 풀업 저항이 있어 평소 HIGH(1), 누르면 LOW(0)를 읽어요.</li>
<li><code>HAL_GPIO_ReadPin()</code>은 <code>GPIO_PIN_SET</code>(1) 또는 <code>GPIO_PIN_RESET</code>(0)을 돌려줍니다.</li>
<li>검은 <b>B2</b>(RESET)를 누르면 프로그램이 처음부터 다시 시작해요.</li>
</ul>
<h4>도전</h4>
<p>누를 때마다 LD2가 토글되도록 바꿔보세요. 이전 상태를 변수에 저장해 <b>눌린 순간(엣지)</b>만 감지하면 됩니다.</p>`,
  spec: [['B1 USER', 'PC13, 누르면 LOW'], ['B2 RESET', 'NRST'], ['내장 풀업/풀다운', '약 40kΩ']],
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
      HAL_GPIO_WritePin(LD2_GPIO_Port, LD2_Pin, GPIO_PIN_SET);
    else
      HAL_GPIO_WritePin(LD2_GPIO_Port, LD2_Pin, GPIO_PIN_RESET);
  }
}

void MX_GPIO_Init(void)
{
  GPIO_InitTypeDef GPIO_InitStruct = {0};
  __HAL_RCC_GPIOA_CLK_ENABLE();
  __HAL_RCC_GPIOC_CLK_ENABLE();

  GPIO_InitStruct.Pin = LD2_Pin;               // PA5 출력
  GPIO_InitStruct.Mode = GPIO_MODE_OUTPUT_PP;
  GPIO_InitStruct.Pull = GPIO_NOPULL;
  HAL_GPIO_Init(LD2_GPIO_Port, &GPIO_InitStruct);

  GPIO_InitStruct.Pin = B1_Pin;                // PC13 입력
  GPIO_InitStruct.Mode = GPIO_MODE_INPUT;
  GPIO_InitStruct.Pull = GPIO_NOPULL;          // 보드에 풀업 저항 있음
  HAL_GPIO_Init(B1_GPIO_Port, &GPIO_InitStruct);
}
`
},
{
  id: 'ext-button', sec: S1, title: '외부 버튼 + LED', tag: 'GPIO 입력 · 배선',
  comps: [
    { id: 'btn1', type: 'button', name: '버튼 모듈', x: 480, y: 300 },
    { id: 'led1', type: 'led', color: 'green', name: 'LED 초록', x: 720, y: 250 }
  ],
  wiring: [['btn1:S', 'B:PA10'], ['btn1:+', 'B:3V3'], ['btn1:-', G], ['led1:+', 'B:PB5'], ['led1:-', G]],
  goal: { text: '버튼으로 LED를 2번 이상 바꾸면 완료', check: s => s.reactive >= 2 && s.presses >= 1 && s.ledEdges.led1 >= 2 },
  overview: `
<p>버튼 모듈을 <b>D2(PA10)</b>에, LED를 <b>D4(PB5)</b>에 연결해 버튼으로 LED를 켭니다.</p>
<h4>핵심 개념</h4>
<ul>
<li>버튼 모듈의 <b>S</b>는 누르면 HIGH, 떼면 LOW예요 (모듈에 풀다운 저항 내장).</li>
<li>모듈 <b>+</b>는 3V3, <b>−</b>는 GND에 연결합니다. 5V를 쓰면 S 출력도 5V가 돼요.</li>
<li>전원이 없으면 S가 떠 있는(floating) 상태가 되어 값이 불안정해요. 그래서 MCU 내부 풀다운(<code>GPIO_PULLDOWN</code>)을 함께 설정합니다.</li>
</ul>
<h4>도전</h4>
<p>버튼을 누를 때마다 LED가 토글되게 바꾸고, 채터링(바운스)을 막기 위해 20ms 디바운스를 넣어보세요.</p>`,
  spec: [['D2', 'PA10'], ['D4', 'PB5'], ['버튼 모듈', 'S / + / −, 누르면 S=HIGH']],
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

  GPIO_InitStruct.Pin = GPIO_PIN_10;           // 버튼 입력, 내부 풀다운
  GPIO_InitStruct.Mode = GPIO_MODE_INPUT;
  GPIO_InitStruct.Pull = GPIO_PULLDOWN;
  HAL_GPIO_Init(GPIOA, &GPIO_InitStruct);

  GPIO_InitStruct.Pin = GPIO_PIN_5;            // LED 출력
  GPIO_InitStruct.Mode = GPIO_MODE_OUTPUT_PP;
  GPIO_InitStruct.Pull = GPIO_NOPULL;
  HAL_GPIO_Init(GPIOB, &GPIO_InitStruct);
}
`
},
{
  id: 'exti', sec: S1, title: '외부 인터럽트 EXTI', tag: 'EXTI · NVIC · 콜백',
  comps: [], wiring: [],
  goal: { text: 'B1 인터럽트로 LD2를 2번 이상 토글하면 완료', check: s => (s.irq.exti || 0) >= 2 && s.ld2Edges >= 2 },
  overview: `
<p>폴링은 CPU가 계속 버튼을 확인해야 해요. <b>인터럽트</b>는 버튼이 눌리는 순간 하드웨어가 알려주고, CPU는 그때만 콜백 함수를 실행합니다.</p>
<h4>핵심 개념</h4>
<ul>
<li><code>GPIO_MODE_IT_FALLING</code>: 신호가 HIGH→LOW로 떨어지는 순간(B1 누름) 인터럽트 발생.</li>
<li>핀 번호마다 EXTI 라인이 정해져 있어요. PC13은 <b>EXTI13</b> → <code>EXTI15_10_IRQn</code>.</li>
<li><b>NVIC</b>에서 해당 IRQ를 켜야(<code>HAL_NVIC_EnableIRQ</code>) 실제로 인터럽트가 들어와요.</li>
<li>HAL은 공통 콜백 <code>HAL_GPIO_EXTI_Callback(GPIO_Pin)</code>을 호출해요. 콜백은 짧게, 무거운 일(printf 등)은 <b>플래그</b>만 세우고 main에서 처리합니다.</li>
<li>콜백과 main이 함께 쓰는 변수는 <code>volatile</code>로 선언하세요.</li>
</ul>
<h4>도전</h4>
<p><code>GPIO_MODE_IT_RISING_FALLING</code>으로 바꿔 누를 때와 뗄 때 모두 반응하게 해보세요.</p>`,
  spec: [['B1', 'PC13 → EXTI13'], ['IRQ', 'EXTI15_10_IRQn'], ['콜백', 'HAL_GPIO_EXTI_Callback']],
  code: `#include "main.h"
#include <stdio.h>

volatile int press_count = 0;
volatile int flag = 0;

void MX_GPIO_Init(void);

int main(void)
{
  HAL_Init();
  SystemClock_Config();
  MX_GPIO_Init();
  MX_USART2_UART_Init();
  printf("B1을 눌러보세요 (인터럽트)\\r\\n");

  while (1)
  {
    if (flag)                       // 인터럽트가 세운 플래그 확인
    {
      flag = 0;
      printf("버튼 인터럽트 %d회\\r\\n", press_count);
    }
  }
}

// B1이 눌리는 순간(하강 엣지) 자동으로 호출됨
void HAL_GPIO_EXTI_Callback(uint16_t GPIO_Pin)
{
  if (GPIO_Pin == B1_Pin)
  {
    HAL_GPIO_TogglePin(LD2_GPIO_Port, LD2_Pin);
    press_count++;
    flag = 1;
  }
}

void MX_GPIO_Init(void)
{
  GPIO_InitTypeDef GPIO_InitStruct = {0};
  __HAL_RCC_GPIOA_CLK_ENABLE();
  __HAL_RCC_GPIOC_CLK_ENABLE();

  GPIO_InitStruct.Pin = LD2_Pin;
  GPIO_InitStruct.Mode = GPIO_MODE_OUTPUT_PP;
  GPIO_InitStruct.Pull = GPIO_NOPULL;
  HAL_GPIO_Init(LD2_GPIO_Port, &GPIO_InitStruct);

  GPIO_InitStruct.Pin = B1_Pin;
  GPIO_InitStruct.Mode = GPIO_MODE_IT_FALLING;   // 하강 엣지 인터럽트
  GPIO_InitStruct.Pull = GPIO_NOPULL;
  HAL_GPIO_Init(B1_GPIO_Port, &GPIO_InitStruct);

  HAL_NVIC_SetPriority(EXTI15_10_IRQn, 0, 0);
  HAL_NVIC_EnableIRQ(EXTI15_10_IRQn);            // NVIC에서 켜기
}
`
},

/* ================= 타이머 · PWM ================= */
{
  id: 'timer-it', sec: S2, title: '타이머 주기 인터럽트', tag: 'TIM11 · 업데이트 인터럽트',
  comps: [], wiring: [],
  goal: { text: '타이머 인터럽트가 4번 이상 발생하고 LD2가 토글되면 완료', check: s => (s.irq.tim || 0) >= 4 && s.ld2Edges >= 4 },
  overview: `
<p>HAL_Delay는 기다리는 동안 CPU를 붙잡아요. 하드웨어 타이머가 일정 주기마다 인터럽트를 걸게 하면 main은 다른 일을 하면서도 정확한 주기로 작업할 수 있어요. <b>PID 제어 루프</b>도 이 방식으로 돌립니다.</p>
<h4>핵심 개념</h4>
<ul>
<li>주기 = (PSC+1) × (ARR+1) / 타이머 클럭. TIM11 클럭 84MHz, PSC 8399 → 10kHz(0.1ms).</li>
<li>ARR 4999 → 5000 × 0.1ms = <b>0.5초</b>마다 업데이트 이벤트.</li>
<li><code>HAL_TIM_Base_Start_IT()</code>로 시작하면 주기마다 <code>HAL_TIM_PeriodElapsedCallback()</code>이 호출돼요.</li>
<li>여러 타이머가 같은 콜백을 쓰므로 <code>htim->Instance</code>로 어느 타이머인지 구분합니다.</li>
</ul>
<h4>도전</h4>
<p>ARR을 바꿔 0.1초 주기로 만들고, main에서는 B1 버튼 폴링을 동시에 해보세요.</p>`,
  spec: [['TIM11 클럭', '84MHz (APB2)'], ['PSC / ARR', '8399 / 4999 → 0.5s'], ['IRQ', 'TIM1_TRG_COM_TIM11_IRQn']],
  code: `#include "main.h"
#include <stdio.h>

volatile uint32_t ticks = 0;

void MX_GPIO_Init(void);

void HAL_TIM_PeriodElapsedCallback(TIM_HandleTypeDef *htim)
{
  if (htim->Instance == TIM11)          // TIM11 업데이트 인터럽트
  {
    ticks++;
    HAL_GPIO_TogglePin(GPIOA, GPIO_PIN_5);
  }
}

int main(void)
{
  HAL_Init();
  SystemClock_Config();
  MX_GPIO_Init();
  MX_USART2_UART_Init();
  MX_TIM11_Init();                      // PSC=8399 → 10kHz

  __HAL_TIM_SET_AUTORELOAD(&htim11, 4999);   // 5000 × 0.1ms = 0.5s
  HAL_TIM_Base_Start_IT(&htim11);

  while (1)
  {
    printf("인터럽트 %lu회 · main은 다른 일을 해요\\r\\n", ticks);
    HAL_Delay(1000);
  }
}

void MX_GPIO_Init(void)
{
  GPIO_InitTypeDef GPIO_InitStruct = {0};
  __HAL_RCC_GPIOA_CLK_ENABLE();
  GPIO_InitStruct.Pin = GPIO_PIN_5;
  GPIO_InitStruct.Mode = GPIO_MODE_OUTPUT_PP;
  HAL_GPIO_Init(GPIOA, &GPIO_InitStruct);
}
`
},
{
  id: 'pwm', sec: S2, title: 'PWM으로 LED 밝기', tag: 'TIM3 · PWM',
  comps: [{ id: 'led1', type: 'led', color: 'yellow', name: 'LED 노랑', x: 620, y: 250 }],
  wiring: [['led1:+', 'B:PA6'], ['led1:-', G]],
  goal: { text: 'LED 밝기가 5단계 이상 바뀌면 완료', check: s => s.ledLevels.led1 && s.ledLevels.led1.size >= 5 },
  overview: `
<p><b>D12(PA6)</b>는 <b>TIM3 채널 1</b>로 PWM을 낼 수 있어요. 듀티비를 바꿔 LED가 서서히 밝아지고 어두워지게 합니다.</p>
<h4>핵심 개념</h4>
<ul>
<li><b>PWM 주파수</b> = 타이머 클럭 / (PSC+1) / (ARR+1) = 84MHz / 84 / 1000 = <b>1kHz</b>.</li>
<li><b>듀티비</b> = CCR / (ARR+1). <code>__HAL_TIM_SET_COMPARE()</code>로 CCR 값을 바꿉니다.</li>
<li>핀은 GPIO가 아닌 <b>대체 기능(AF2, TIM3)</b> 모드예요. <code>MX_TIM3_Init()</code>이 처리합니다.</li>
</ul>
<h4>도전</h4>
<p>밝기 변화가 눈에 자연스럽도록 듀티를 제곱 곡선(감마 보정)으로 바꿔보세요.</p>`,
  spec: [['D12', 'PA6 = TIM3_CH1 (AF2)'], ['PSC / ARR', '83 / 999 → 1kHz'], ['CCR 범위', '0 ~ 999']],
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
  id: 'rgb', sec: S2, title: 'RGB LED 색 섞기', tag: 'TIM3 · PWM 3채널',
  comps: [{ id: 'rgb1', type: 'rgb', name: 'RGB LED (공통 캐소드)', x: 620, y: 250 }],
  wiring: [['rgb1:R', 'B:PA6'], ['rgb1:G', 'B:PA7'], ['rgb1:B', 'B:PB0'], ['rgb1:-', G]],
  goal: { text: '서로 다른 색을 6가지 이상 만들면 완료', check: s => s.rgbColors.size >= 6 },
  overview: `
<p>한 타이머(TIM3)의 채널 3개로 빨강·초록·파랑 밝기를 따로 조절해 색을 섞어요.</p>
<h4>배선</h4>
<ul><li>R → <b>D12(PA6)</b> TIM3_CH1, G → <b>D11(PA7)</b> TIM3_CH2, B → <b>A3(PB0)</b> TIM3_CH3, − → GND</li></ul>
<h4>핵심 개념</h4>
<ul>
<li>같은 타이머의 채널은 주기(ARR)를 공유하고 듀티(CCR)만 따로 가져요.</li>
<li><b>공통 캐소드</b>는 공통 단자를 GND에, <b>공통 애노드</b>는 3.3V에 연결하고 논리가 반대예요.</li>
</ul>
<h4>도전</h4>
<p>가변저항 3개(ADC)로 R·G·B를 각각 조절하는 색 선택기를 만들어보세요.</p>`,
  spec: [['R / G / B', 'PA6 / PA7 / PB0'], ['타이머', 'TIM3 CH1~CH3, 1kHz'], ['종류', '공통 캐소드']],
  code: `#include "main.h"

void set_rgb(uint16_t r, uint16_t g, uint16_t b)   // 각 0~999
{
  __HAL_TIM_SET_COMPARE(&htim3, TIM_CHANNEL_1, r);
  __HAL_TIM_SET_COMPARE(&htim3, TIM_CHANNEL_2, g);
  __HAL_TIM_SET_COMPARE(&htim3, TIM_CHANNEL_3, b);
}

int main(void)
{
  HAL_Init();
  SystemClock_Config();
  MX_TIM3_Init();
  HAL_TIM_PWM_Start(&htim3, TIM_CHANNEL_1);
  HAL_TIM_PWM_Start(&htim3, TIM_CHANNEL_2);
  HAL_TIM_PWM_Start(&htim3, TIM_CHANNEL_3);

  while (1)
  {
    for (int i = 0; i < 1000; i += 25) { set_rgb(999 - i, i, 0); HAL_Delay(20); }  // 빨강→초록
    for (int i = 0; i < 1000; i += 25) { set_rgb(0, 999 - i, i); HAL_Delay(20); }  // 초록→파랑
    for (int i = 0; i < 1000; i += 25) { set_rgb(i, 0, 999 - i); HAL_Delay(20); }  // 파랑→빨강
  }
}
`
},
{
  id: 'buzzer', sec: S2, title: '부저로 멜로디', tag: 'TIM4 · 주파수 변경',
  comps: [{ id: 'bz1', type: 'buzzer', name: '수동 부저', x: 640, y: 250 }],
  wiring: [['bz1:+', 'B:PB6'], ['bz1:-', G]],
  goal: { text: '서로 다른 음을 5개 이상 내면 완료', check: s => s.buzzFreqs.size >= 5 },
  overview: `
<p><b>수동 부저</b>는 넣어주는 주파수대로 소리가 나요. 타이머의 <b>ARR(주기)</b>을 바꿔 음높이를, <b>CCR</b>로 듀티 50%를 만듭니다. 위쪽 <b>소리 켬</b> 버튼으로 실제 소리를 들을 수 있어요.</p>
<h4>핵심 개념</h4>
<ul>
<li>TIM4를 1MHz로 세면 ARR = 1,000,000 / 주파수 − 1. 도(262Hz) → ARR 3816.</li>
<li>CCR = ARR/2 → 듀티 50%. CCR = 0이면 소리가 꺼져요.</li>
<li><b>능동 부저</b>는 전원만 넣으면 정해진 음이 나서 GPIO ON/OFF로 충분해요.</li>
</ul>
<h4>도전</h4>
<p>B1을 누르면 경고음(1kHz↔2kHz 교대)이 나게 해보세요.</p>`,
  spec: [['D10', 'PB6 = TIM4_CH1'], ['TIM4 카운트', '1MHz (PSC 83)'], ['도4 / 라4', '262Hz / 440Hz']],
  code: `#include "main.h"

int melody[] = {262, 294, 330, 349, 392, 440, 494, 523};   // 도레미파솔라시도
int beats[]  = {1, 1, 1, 1, 1, 1, 1, 2};

void tone(uint32_t freq)
{
  if (freq == 0)
  {
    __HAL_TIM_SET_COMPARE(&htim4, TIM_CHANNEL_1, 0);   // 소리 끔
    return;
  }
  uint32_t arr = 1000000 / freq - 1;                    // TIM4 1MHz 기준
  __HAL_TIM_SET_AUTORELOAD(&htim4, arr);
  __HAL_TIM_SET_COMPARE(&htim4, TIM_CHANNEL_1, arr / 2); // 듀티 50%
}

int main(void)
{
  HAL_Init();
  SystemClock_Config();
  MX_TIM4_Init();
  HAL_TIM_PWM_Start(&htim4, TIM_CHANNEL_1);

  while (1)
  {
    for (int i = 0; i < 8; i++)
    {
      tone(melody[i]);
      HAL_Delay(300 * beats[i]);
      tone(0);
      HAL_Delay(50);
    }
    HAL_Delay(1000);
  }
}
`
},

/* ================= 통신 ================= */
{
  id: 'uart', sec: S3, title: 'UART로 printf 출력', tag: 'USART2 · 송신',
  comps: [], wiring: [],
  goal: { text: '시리얼 모니터에 3줄 이상 출력되면 완료', check: s => s.serialLines >= 3 },
  overview: `
<p>Nucleo의 <b>USART2</b>(PA2/PA3)는 ST-LINK를 거쳐 USB 가상 COM 포트로 PC에 연결돼 있어요. 아래 시리얼 모니터에서 출력을 확인합니다.</p>
<h4>핵심 개념</h4>
<ul>
<li><code>HAL_UART_Transmit(&amp;huart2, 버퍼, 길이, 타임아웃)</code>으로 바이트를 보냅니다.</li>
<li>실제 보드에서 <code>printf</code>를 쓰려면 <code>__io_putchar()</code>를 UART로 연결(retarget)해야 해요. 이 실습실은 이미 된 상태입니다.</li>
<li><b>플로터</b> 탭: <code>printf("a:%d,b:%d\\r\\n", ...)</code>처럼 출력하면 그래프로 그려줘요.</li>
</ul>
<h4>실제 보드용 retarget 코드</h4>
<pre class="snip">int __io_putchar(int ch)
{
  HAL_UART_Transmit(&amp;huart2, (uint8_t *)&amp;ch, 1, HAL_MAX_DELAY);
  return ch;
}</pre>`,
  spec: [['USART2 TX/RX', 'PA2 (D1) / PA3 (D0)'], ['설정', '115200 bps, 8N1'], ['HAL_GetTick()', '부팅 후 경과 ms']],
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
  id: 'uart-rx', sec: S3, title: 'UART 명령 수신', tag: 'USART2 · 수신 인터럽트',
  comps: [], wiring: [],
  goal: { text: '시리얼 입력창으로 명령을 보내 LD2를 2번 이상 바꾸면 완료', check: s => s.rxBytes >= 2 && s.ld2Edges >= 2 },
  overview: `
<p>PC에서 보낸 문자를 받아 LD2를 제어해요. 실행 후 시리얼 모니터 아래 입력창에 <b>1</b>, <b>0</b>, <b>t</b>를 입력하고 보내기를 누르세요.</p>
<h4>핵심 개념</h4>
<ul>
<li><code>HAL_UART_Receive_IT(&amp;huart2, rx, 1)</code>: 1바이트가 들어오면 <code>HAL_UART_RxCpltCallback()</code>이 호출돼요.</li>
<li>수신 인터럽트는 1회성이라 콜백 안에서 다시 <code>Receive_IT</code>를 걸어야 계속 받습니다.</li>
<li>폴링 방식 <code>HAL_UART_Receive(&amp;huart2, rx, 1, 100)</code>은 타임아웃까지 기다려요.</li>
<li>이 실습실에서는 수신 버퍼를 <code>uint8_t rx[1];</code>처럼 <b>배열</b>로 선언해야 해요.</li>
</ul>
<h4>도전</h4>
<p>"ON", "OFF"처럼 여러 글자 명령을 줄바꿈(\\n)까지 모아서 처리해보세요.</p>`,
  spec: [['수신 핀', 'PA3 (USART2_RX)'], ['콜백', 'HAL_UART_RxCpltCallback'], ['IRQ', 'USART2_IRQn']],
  code: `#include "main.h"
#include <stdio.h>

uint8_t rx[1];

void MX_GPIO_Init(void);

void HAL_UART_RxCpltCallback(UART_HandleTypeDef *huart)
{
  if (huart->Instance == USART2)
  {
    char c = rx[0];
    if (c == '1')      { HAL_GPIO_WritePin(GPIOA, GPIO_PIN_5, GPIO_PIN_SET);   printf("LED ON\\r\\n"); }
    else if (c == '0') { HAL_GPIO_WritePin(GPIOA, GPIO_PIN_5, GPIO_PIN_RESET); printf("LED OFF\\r\\n"); }
    else if (c == 't') { HAL_GPIO_TogglePin(GPIOA, GPIO_PIN_5);               printf("TOGGLE\\r\\n"); }
    else if (c != '\\r' && c != '\\n') printf("알 수 없는 명령: %c\\r\\n", c);

    HAL_UART_Receive_IT(&huart2, rx, 1);   // 다음 1바이트 다시 대기
  }
}

int main(void)
{
  HAL_Init();
  SystemClock_Config();
  MX_GPIO_Init();
  MX_USART2_UART_Init();

  printf("명령: 1=켜기, 0=끄기, t=토글\\r\\n");
  HAL_UART_Receive_IT(&huart2, rx, 1);

  while (1)
  {
    // 수신은 인터럽트가 처리하므로 main은 비어 있어도 됨
  }
}

void MX_GPIO_Init(void)
{
  GPIO_InitTypeDef GPIO_InitStruct = {0};
  __HAL_RCC_GPIOA_CLK_ENABLE();
  GPIO_InitStruct.Pin = GPIO_PIN_5;
  GPIO_InitStruct.Mode = GPIO_MODE_OUTPUT_PP;
  HAL_GPIO_Init(GPIOA, &GPIO_InitStruct);
}
`
},
{
  id: 'i2c-lcd', sec: S3, title: 'I2C LCD 16x2', tag: 'I2C1 · 장치 스캔',
  comps: [{ id: 'lcd1', type: 'lcd', name: 'LCD 16x2 (PCF8574)', x: 480, y: 260 }],
  wiring: [['lcd1:GND', G], ['lcd1:VCC', 'B:5V'], ['lcd1:SDA', 'B:PB9'], ['lcd1:SCL', 'B:PB8']],
  goal: { text: 'LCD에 Hello가 표시되면 완료', check: s => /Hello/.test(s.lcdText) },
  overview: `
<p><b>I2C</b>는 SDA(데이터)·SCL(클럭) 두 선으로 여러 장치와 통신해요. 장치마다 7비트 <b>주소</b>가 있어서 같은 선에 여러 개를 연결할 수 있습니다.</p>
<h4>배선</h4>
<ul><li>SDA → <b>D14(PB9)</b>, SCL → <b>D15(PB8)</b>, VCC → 5V, GND → GND</li></ul>
<h4>핵심 개념</h4>
<ul>
<li>HAL은 주소를 <b>왼쪽으로 1비트 민</b> 8비트로 받아요: <code>0x27 &lt;&lt; 1</code>.</li>
<li><code>HAL_I2C_IsDeviceReady()</code>로 응답하는 주소를 찾는 <b>I2C 스캐너</b>는 배선 확인에 꼭 필요해요.</li>
<li>PCF8574 백팩은 I2C를 LCD의 4비트 병렬 신호로 바꿔줘요. 이 실습실은 많이 쓰는 <code>i2c-lcd</code> 라이브러리 함수(<code>lcd_init</code>, <code>lcd_put_cur</code>, <code>lcd_send_string</code>, <code>lcd_clear</code>)를 제공합니다.</li>
<li>실제 I2C 선에는 풀업 저항(보통 4.7kΩ)이 필요하고, 대부분 모듈에 달려 있어요.</li>
</ul>`,
  spec: [['I2C1', 'PB8 SCL · PB9 SDA'], ['LCD 주소', '0x27 (일부 0x3F)'], ['속도', '100kHz Standard']],
  code: `#include "main.h"
#include <stdio.h>
#include "i2c-lcd.h"

int main(void)
{
  HAL_Init();
  SystemClock_Config();
  MX_USART2_UART_Init();
  MX_I2C1_Init();

  // I2C 스캐너: 응답하는 장치 주소 찾기
  for (uint8_t addr = 1; addr < 128; addr++)
  {
    if (HAL_I2C_IsDeviceReady(&hi2c1, addr << 1, 1, 10) == HAL_OK)
      printf("I2C 장치 발견: 0x%02X\\r\\n", addr);
  }

  lcd_init();
  lcd_put_cur(0, 0);
  lcd_send_string("Hello STM32!");

  int sec = 0;
  char buf[17];
  while (1)
  {
    sprintf(buf, "Uptime: %4d s", sec);
    lcd_put_cur(1, 0);
    lcd_send_string(buf);
    sec++;
    HAL_Delay(1000);
  }
}
`
},
{
  id: 'oled', sec: S3, title: 'OLED 그래픽', tag: 'I2C1 · SSD1306',
  comps: [{ id: 'oled1', type: 'oled', name: 'OLED 0.96" SSD1306', x: 560, y: 250 }],
  wiring: [['oled1:GND', G], ['oled1:VCC', 'B:3V3'], ['oled1:SCL', 'B:PB8'], ['oled1:SDA', 'B:PB9']],
  goal: { text: 'OLED 화면을 10번 이상 갱신하면 완료', check: s => s.oledFrames >= 10 },
  overview: `
<p>128×64 픽셀 OLED에 글자와 도형을 그리고 움직여요. 오픈소스 <b>stm32-ssd1306</b> 라이브러리와 같은 함수를 씁니다.</p>
<h4>핵심 개념</h4>
<ul>
<li>그리기 함수는 MCU 메모리의 <b>프레임버퍼</b>(1024바이트)에만 그려요. <code>ssd1306_UpdateScreen()</code>을 불러야 I2C로 화면에 전송됩니다.</li>
<li>애니메이션은 <b>지우기 → 그리기 → 전송</b>을 반복해요.</li>
<li>함수: <code>ssd1306_Fill</code>, <code>SetCursor</code>, <code>WriteString(문자열, Font_7x10, White)</code>, <code>DrawPixel</code>, <code>Line</code>, <code>DrawRectangle</code>, <code>DrawCircle</code>, <code>FillCircle</code></li>
<li>OLED 주소는 보통 <b>0x3C</b>예요.</li>
</ul>
<h4>도전</h4>
<p>가변저항 값을 막대그래프로 실시간 표시해보세요.</p>`,
  spec: [['해상도', '128 × 64, 단색'], ['주소', '0x3C'], ['프레임버퍼', '1024 바이트']],
  code: `#include "main.h"
#include "ssd1306.h"
#include "ssd1306_fonts.h"

int main(void)
{
  HAL_Init();
  SystemClock_Config();
  MX_I2C1_Init();
  ssd1306_Init();

  int x = 0, dx = 3;
  while (1)
  {
    ssd1306_Fill(Black);                                   // 1) 지우기
    ssd1306_SetCursor(2, 0);
    ssd1306_WriteString("STM32 OLED", Font_11x18, White);  // 2) 그리기
    ssd1306_SetCursor(2, 22);
    ssd1306_WriteString("SSD1306 128x64", Font_7x10, White);
    ssd1306_DrawRectangle(0, 36, 127, 63, White);
    ssd1306_FillCircle(10 + x, 50, 8, White);              // 움직이는 공
    ssd1306_UpdateScreen();                                // 3) 전송

    x += dx;
    if (x > 106 || x < 0) dx = -dx;
    HAL_Delay(40);
  }
}
`
},

/* ================= 센서 · 표시 ================= */
{
  id: 'adc', sec: S4, title: '가변저항 ADC 읽기', tag: 'ADC1 · 아날로그',
  comps: [{ id: 'pot1', type: 'pot', name: '가변저항', x: 600, y: 280 }],
  wiring: [['pot1:+', 'B:3V3'], ['pot1:S', 'B:PA0'], ['pot1:-', G]],
  goal: { text: '노브를 돌려 서로 다른 값 4개 이상 읽으면 완료', check: s => s.adcValues.size >= 4 }, plot: true,
  overview: `
<p>가변저항의 가운데 단자(<b>S</b>)를 <b>A0(PA0)</b>에 연결하고 12비트 ADC로 전압을 읽어요. 노브를 끌어서 돌려보세요. 플로터 탭에서 그래프로 볼 수 있어요.</p>
<h4>핵심 개념</h4>
<ul>
<li><b>12비트 ADC</b>: 0~3.3V를 0~4095로 바꿔요. 전압(mV) = 값 × 3300 / 4095.</li>
<li>폴링 방식: <code>HAL_ADC_Start</code> → <code>HAL_ADC_PollForConversion</code> → <code>HAL_ADC_GetValue</code>.</li>
<li>ADC 입력에 3.3V를 넘는 전압을 넣으면 안 돼요. 가변저항 +는 반드시 <b>3V3</b>에.</li>
<li>다른 채널은 <code>ADC_ChannelConfTypeDef</code>의 <code>Channel</code>을 바꿔 <code>HAL_ADC_ConfigChannel()</code>로 선택해요.</li>
</ul>`,
  spec: [['A0', 'PA0 = ADC1_IN0'], ['분해능', '12bit (0~4095)'], ['기준 전압', 'VDDA = 3.3V']],
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
    printf("adc:%lu,mV:%lu\\r\\n", raw, mv);
    HAL_Delay(100);
  }
}
`
},
{
  id: 'ultrasonic', sec: S4, title: '초음파 거리 측정', tag: 'HC-SR04 · µs 타이머',
  comps: [{ id: 'us1', type: 'hcsr04', name: '초음파 HC-SR04', x: 560, y: 260 }],
  wiring: [['us1:VCC', 'B:5V'], ['us1:TRIG', 'B:PA9'], ['us1:ECHO', 'B:PA8'], ['us1:GND', G]],
  goal: { text: '초음파를 5번 이상 쏘고 거리를 출력하면 완료', check: s => s.pings >= 5 && s.serialLines >= 5 }, plot: true,
  overview: `
<p>TRIG에 10µs 펄스를 주면 센서가 초음파를 쏘고, 반사돼 돌아오는 시간만큼 ECHO가 HIGH가 돼요. 이 시간을 <b>µs 단위</b>로 재면 거리를 알 수 있어요. 빨간 블록을 끌어 물체 거리를 바꿔보세요.</p>
<h4>핵심 개념</h4>
<ul>
<li>거리(cm) = ECHO 폭(µs) / 58. 소리는 약 340m/s, 왕복이라 1cm에 약 58µs.</li>
<li><b>TIM5</b>를 1MHz로 자유롭게 세게 해 µs 카운터로 써요: <code>__HAL_TIM_GET_COUNTER(&amp;htim5)</code>.</li>
<li>무한 대기를 막기 위해 <b>타임아웃</b>을 꼭 넣어요.</li>
<li>HC-SR04 ECHO는 5V 출력이에요. PA8은 5V 허용(FT) 핀이지만, ADC 겸용 핀처럼 5V를 견디지 못하는 핀도 있으니 데이터시트를 확인하세요.</li>
</ul>
<h4>도전</h4>
<p>거리가 10cm 이하면 부저가 울리는 주차 센서를 만들어보세요.</p>`,
  spec: [['TRIG / ECHO', 'PA9 (D8) / PA8 (D7)'], ['측정 범위', '2 ~ 400cm'], ['µs 타이머', 'TIM5, 1MHz, 32bit']],
  code: `#include "main.h"
#include <stdio.h>

#define TRIG_PORT GPIOA
#define TRIG_PIN  GPIO_PIN_9    // D8
#define ECHO_PORT GPIOA
#define ECHO_PIN  GPIO_PIN_8    // D7

void MX_GPIO_Init(void);

void delay_us(uint32_t us)
{
  __HAL_TIM_SET_COUNTER(&htim5, 0);
  while (__HAL_TIM_GET_COUNTER(&htim5) < us);
}

float read_distance_cm(void)
{
  HAL_GPIO_WritePin(TRIG_PORT, TRIG_PIN, GPIO_PIN_SET);     // 10us 트리거
  delay_us(10);
  HAL_GPIO_WritePin(TRIG_PORT, TRIG_PIN, GPIO_PIN_RESET);

  uint32_t start = HAL_GetTick();
  while (HAL_GPIO_ReadPin(ECHO_PORT, ECHO_PIN) == GPIO_PIN_RESET)   // ECHO 시작 대기
  {
    if (HAL_GetTick() - start > 30) return -1;
  }
  __HAL_TIM_SET_COUNTER(&htim5, 0);
  while (HAL_GPIO_ReadPin(ECHO_PORT, ECHO_PIN) == GPIO_PIN_SET)     // ECHO 폭 측정
  {
    if (__HAL_TIM_GET_COUNTER(&htim5) > 30000) return -1;
  }
  uint32_t width = __HAL_TIM_GET_COUNTER(&htim5);
  return width / 58.0f;
}

int main(void)
{
  HAL_Init();
  SystemClock_Config();
  MX_GPIO_Init();
  MX_USART2_UART_Init();
  MX_TIM5_Init();
  HAL_TIM_Base_Start(&htim5);

  while (1)
  {
    float d = read_distance_cm();
    if (d < 0) printf("측정 실패\\r\\n");
    else printf("distance:%.1f\\r\\n", d);
    HAL_Delay(100);
  }
}

void MX_GPIO_Init(void)
{
  GPIO_InitTypeDef GPIO_InitStruct = {0};
  __HAL_RCC_GPIOA_CLK_ENABLE();

  GPIO_InitStruct.Pin = TRIG_PIN;
  GPIO_InitStruct.Mode = GPIO_MODE_OUTPUT_PP;
  HAL_GPIO_Init(TRIG_PORT, &GPIO_InitStruct);

  GPIO_InitStruct.Pin = ECHO_PIN;
  GPIO_InitStruct.Mode = GPIO_MODE_INPUT;
  GPIO_InitStruct.Pull = GPIO_NOPULL;
  HAL_GPIO_Init(ECHO_PORT, &GPIO_InitStruct);
}
`
},
{
  id: 'dht11', sec: S4, title: '온습도 센서 DHT11', tag: '단선 통신 · 드라이버',
  comps: [{ id: 'dht1', type: 'dht11', name: '온습도 DHT11', x: 600, y: 260 }],
  wiring: [['dht1:+', 'B:3V3'], ['dht1:DATA', 'B:PA10'], ['dht1:-', G]],
  goal: { text: '온습도를 2번 이상 읽으면 완료', check: s => s.dhtReads >= 2 }, plot: true,
  overview: `
<p>DHT11은 선 하나(DATA)로 온도·습도를 보내요. 센서를 위아래로 끌면 온도, 좌우로 끌면 습도가 바뀝니다.</p>
<h4>통신 방식</h4>
<ol><li>MCU가 DATA를 18ms 이상 LOW로 당겨 시작 신호를 보내요.</li><li>센서가 80µs LOW, 80µs HIGH로 응답해요.</li><li>40비트(습도 2바이트, 온도 2바이트, 체크섬 1바이트)를 보내요. 각 비트는 50µs LOW 뒤 HIGH 길이로 0(약 26µs)과 1(약 70µs)을 구분해요.</li></ol>
<h4>이 실습실의 범위</h4>
<p>µs 단위 비트 읽기는 <code>dht11.h</code> 드라이버의 <code>DHT11_Read(포트, 핀)</code>가 처리한다고 가정해요. 결과 구조체에 <code>ok</code>, <code>Temperature</code>, <code>Humidity</code>가 들어 있어요. DHT11은 <b>1초에 한 번</b>만 읽을 수 있어요.</p>
<h4>도전</h4>
<p>LCD 레슨과 합쳐 온습도계를 만들어보세요.</p>`,
  spec: [['DATA', 'PA10 (D2)'], ['범위', '0~50°C ±2°C, 20~90% ±5%'], ['읽기 간격', '1초 이상']],
  code: `#include "main.h"
#include <stdio.h>
#include "dht11.h"

int main(void)
{
  HAL_Init();
  SystemClock_Config();
  __HAL_RCC_GPIOA_CLK_ENABLE();
  MX_USART2_UART_Init();

  while (1)
  {
    DHT11_Data d = DHT11_Read(GPIOA, GPIO_PIN_10);   // D2
    if (d.ok)
      printf("temp:%d,humi:%d\\r\\n", d.Temperature, d.Humidity);
    else
      printf("DHT11 응답 없음\\r\\n");
    HAL_Delay(1500);
  }
}
`
},
{
  id: 'seg7', sec: S4, title: '7세그먼트 숫자 표시', tag: 'GPIO 8개 · 배열',
  comps: [{ id: 'seg1', type: 'seg7', name: '7세그먼트 (공통 캐소드)', x: 560, y: 230 }],
  wiring: [['seg1:a', 'B:PA10'], ['seg1:b', 'B:PB3'], ['seg1:c', 'B:PB5'], ['seg1:d', 'B:PB4'], ['seg1:e', 'B:PB10'], ['seg1:f', 'B:PA8'], ['seg1:g', 'B:PA9'], ['seg1:dp', 'B:PC7'], ['seg1:COM', G]],
  goal: { text: '숫자 5개 이상을 정확히 표시하면 완료', check: s => s.digits.size >= 5 },
  overview: `
<p>세그먼트 a~g와 점(dp)을 각각 핀에 연결하고, 숫자마다 켤 세그먼트를 <b>비트 패턴</b>으로 저장해 표시해요.</p>
<h4>배선</h4>
<ul><li>a→D2(PA10), b→D3(PB3), c→D4(PB5), d→D5(PB4), e→D6(PB10), f→D7(PA8), g→D8(PA9), dp→D9(PC7), COM→GND</li></ul>
<h4>핵심 개념</h4>
<ul>
<li>비트0=a … 비트6=g. 0은 a~f가 켜져 <code>0x3F</code>, 1은 b·c만 켜져 <code>0x06</code>.</li>
<li>포트가 섞여 있어서 포트 배열과 핀 배열을 함께 둡니다.</li>
<li>여러 자리를 쓸 때는 자리를 빠르게 번갈아 켜는 <b>다이내믹 구동</b>을 해요.</li>
</ul>`,
  spec: [['세그먼트', 'a~g + dp'], ['종류', '공통 캐소드'], ['0~9 패턴', '0x3F 0x06 0x5B 0x4F 0x66 0x6D 0x7D 0x07 0x7F 0x6F']],
  code: `#include "main.h"

GPIO_TypeDef *seg_port[8] = {GPIOA, GPIOB, GPIOB, GPIOB, GPIOB, GPIOA, GPIOA, GPIOC};
uint16_t seg_pin[8] = {GPIO_PIN_10, GPIO_PIN_3, GPIO_PIN_5, GPIO_PIN_4,
                       GPIO_PIN_10, GPIO_PIN_8, GPIO_PIN_9, GPIO_PIN_7};   // a b c d e f g dp

uint8_t digits[10] = {0x3F, 0x06, 0x5B, 0x4F, 0x66, 0x6D, 0x7D, 0x07, 0x7F, 0x6F};

void MX_GPIO_Init(void);

void show_digit(int n, int dp)
{
  for (int i = 0; i < 7; i++)
    HAL_GPIO_WritePin(seg_port[i], seg_pin[i], (digits[n] >> i) & 1);
  HAL_GPIO_WritePin(seg_port[7], seg_pin[7], dp);
}

int main(void)
{
  HAL_Init();
  SystemClock_Config();
  MX_GPIO_Init();

  while (1)
  {
    for (int n = 0; n < 10; n++)
    {
      show_digit(n, n % 2);
      HAL_Delay(700);
    }
  }
}

void MX_GPIO_Init(void)
{
  GPIO_InitTypeDef GPIO_InitStruct = {0};
  __HAL_RCC_GPIOA_CLK_ENABLE();
  __HAL_RCC_GPIOB_CLK_ENABLE();
  __HAL_RCC_GPIOC_CLK_ENABLE();
  GPIO_InitStruct.Mode = GPIO_MODE_OUTPUT_PP;

  GPIO_InitStruct.Pin = GPIO_PIN_8 | GPIO_PIN_9 | GPIO_PIN_10;
  HAL_GPIO_Init(GPIOA, &GPIO_InitStruct);
  GPIO_InitStruct.Pin = GPIO_PIN_3 | GPIO_PIN_4 | GPIO_PIN_5 | GPIO_PIN_10;
  HAL_GPIO_Init(GPIOB, &GPIO_InitStruct);
  GPIO_InitStruct.Pin = GPIO_PIN_7;
  HAL_GPIO_Init(GPIOC, &GPIO_InitStruct);
}
`
},

/* ================= 모터 제어 ================= */
{
  id: 'relay', sec: S5, title: '릴레이로 램프 켜기', tag: 'GPIO · 전력 스위칭',
  comps: [{ id: 'ry1', type: 'relay', name: '릴레이 모듈', x: 560, y: 260 }],
  wiring: [['ry1:S', 'B:PB5'], ['ry1:+', 'B:5V'], ['ry1:-', G]],
  goal: { text: '릴레이를 2번 이상 전환하면 완료', check: s => s.relayToggles >= 2 },
  overview: `
<p>릴레이는 작은 신호로 큰 전류(가전, 램프, 펌프)를 켜고 끄는 전기 스위치예요. MCU 핀은 25mA밖에 못 내지만, 릴레이 모듈의 트랜지스터가 코일을 대신 구동해요.</p>
<h4>핵심 개념</h4>
<ul>
<li>모듈 전원은 5V, 신호(S)는 3.3V로도 동작하는 제품이 많아요 (이 모듈은 HIGH일 때 켜짐).</li>
<li>코일에는 끌 때 역기전력이 생겨서 <b>플라이백 다이오드</b>가 필요해요. 모듈에 들어 있어요.</li>
<li>220V를 다룰 때는 반드시 절연·퓨즈를 갖추고 전문가 확인을 받으세요.</li>
</ul>`,
  spec: [['신호', 'PB5 (D4), HIGH=ON'], ['모듈 전원', '5V'], ['접점 정격', '10A 250VAC (SRD-05VDC)']],
  code: `#include "main.h"
#include <stdio.h>

void MX_GPIO_Init(void);

int main(void)
{
  HAL_Init();
  SystemClock_Config();
  MX_GPIO_Init();
  MX_USART2_UART_Init();

  while (1)
  {
    HAL_GPIO_WritePin(GPIOB, GPIO_PIN_5, GPIO_PIN_SET);
    printf("릴레이 ON\\r\\n");
    HAL_Delay(2000);
    HAL_GPIO_WritePin(GPIOB, GPIO_PIN_5, GPIO_PIN_RESET);
    printf("릴레이 OFF\\r\\n");
    HAL_Delay(2000);
  }
}

void MX_GPIO_Init(void)
{
  GPIO_InitTypeDef GPIO_InitStruct = {0};
  __HAL_RCC_GPIOB_CLK_ENABLE();
  GPIO_InitStruct.Pin = GPIO_PIN_5;
  GPIO_InitStruct.Mode = GPIO_MODE_OUTPUT_PP;
  HAL_GPIO_Init(GPIOB, &GPIO_InitStruct);
}
`
},
{
  id: 'servo', sec: S5, title: '서보모터 제어', tag: 'TIM1 · 50Hz PWM',
  comps: [{ id: 'servo1', type: 'servo', name: '서보 SG90', x: 580, y: 250 }],
  wiring: [['servo1:S', 'B:PA8'], ['servo1:+', 'B:5V'], ['servo1:-', G]],
  goal: { text: '서보를 0° 근처와 180° 근처까지 움직이면 완료', check: s => s.servoMin <= 20 && s.servoMax >= 160 },
  overview: `
<p>서보모터는 <b>50Hz(20ms 주기)</b> 펄스의 폭으로 각도를 정해요. 내부에 위치 센서와 제어 회로가 있어 스스로 그 각도를 유지합니다. <b>D7(PA8)</b>의 TIM1 채널 1을 씁니다.</p>
<h4>핵심 개념</h4>
<ul>
<li>펄스 0.5ms → 0°, 1.5ms → 90°, 2.5ms → 180° (SG90 기준, 제품마다 조금 달라요).</li>
<li>TIM1을 1MHz로 세고 ARR=19999로 두면 CCR 값이 곧 펄스 폭(µs)이 돼요.</li>
<li>서보 전원은 <b>5V</b>, 신호선은 3.3V 로직으로도 대부분 동작해요. 큰 서보는 별도 전원을 쓰세요.</li>
</ul>`,
  spec: [['D7', 'PA8 = TIM1_CH1'], ['PSC / ARR', '83 / 19999 → 50Hz'], ['서보 선 색', '주황=신호, 빨강=+, 갈색=−']],
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
  id: 'stepper', sec: S5, title: '스텝 모터 각도 제어', tag: '28BYJ-48 · 하프스텝',
  comps: [{ id: 'st1', type: 'stepper', name: '스텝 모터 28BYJ-48 + ULN2003', x: 520, y: 240 }],
  wiring: [['st1:IN1', 'B:PA10'], ['st1:IN2', 'B:PB3'], ['st1:IN3', 'B:PB5'], ['st1:IN4', 'B:PB4'], ['st1:+', 'B:5V'], ['st1:-', G]],
  goal: { text: '정방향 90° 이상 돌리면 완료', check: s => s.stepMax >= 85 },
  overview: `
<p>스텝 모터는 코일을 정해진 순서로 켤 때마다 일정 각도씩 돌아요. 센서 없이도 스텝 수를 세면 각도를 알 수 있습니다(<b>개루프 위치 제어</b>).</p>
<h4>핵심 개념</h4>
<ul>
<li>28BYJ-48은 <b>하프스텝 기준 약 4096스텝 = 1회전</b> (64스텝 × 기어비 약 64:1).</li>
<li>하프스텝 순서: A → AB → B → BC → C → CD → D → DA. 순서를 거꾸로 하면 역회전.</li>
<li>ULN2003은 MCU 신호로 코일 전류를 구동하는 달링턴 드라이버예요. 보드의 LED A~D가 켜진 코일을 보여줘요.</li>
<li>스텝을 너무 빨리 주면 모터가 못 따라가 <b>탈조</b>가 생겨요. 하프스텝당 1ms 이상 기다리세요.</li>
</ul>
<h4>도전</h4>
<p>원하는 각도를 넣으면 그 각도로 이동하는 <code>move_to(deg)</code> 함수를 만들어보세요.</p>`,
  spec: [['IN1~IN4', 'PA10 PB3 PB5 PB4'], ['1회전', '약 4096 하프스텝'], ['전원', '5V']],
  code: `#include "main.h"
#include <stdio.h>

GPIO_TypeDef *in_port[4] = {GPIOA, GPIOB, GPIOB, GPIOB};
uint16_t in_pin[4] = {GPIO_PIN_10, GPIO_PIN_3, GPIO_PIN_5, GPIO_PIN_4};   // IN1~IN4

// 하프스텝 순서 (비트0=IN1 ... 비트3=IN4)
uint8_t seq[8] = {0x01, 0x03, 0x02, 0x06, 0x04, 0x0C, 0x08, 0x09};
int phase = 0;

void MX_GPIO_Init(void);

void step(int dir)            // dir: +1 정방향, -1 역방향
{
  phase = (phase + dir + 8) % 8;
  for (int i = 0; i < 4; i++)
    HAL_GPIO_WritePin(in_port[i], in_pin[i], (seq[phase] >> i) & 1);
}

void rotate_deg(float deg)
{
  int steps = deg / 360.0f * 4096;
  int dir = steps >= 0 ? 1 : -1;
  if (steps < 0) steps = -steps;
  for (int i = 0; i < steps; i++)
  {
    step(dir);
    HAL_Delay(1);
  }
}

int main(void)
{
  HAL_Init();
  SystemClock_Config();
  MX_GPIO_Init();
  MX_USART2_UART_Init();

  while (1)
  {
    printf("정방향 90도\\r\\n");
    rotate_deg(90);
    HAL_Delay(500);
    printf("역방향 90도\\r\\n");
    rotate_deg(-90);
    HAL_Delay(500);
  }
}

void MX_GPIO_Init(void)
{
  GPIO_InitTypeDef GPIO_InitStruct = {0};
  __HAL_RCC_GPIOA_CLK_ENABLE();
  __HAL_RCC_GPIOB_CLK_ENABLE();
  GPIO_InitStruct.Mode = GPIO_MODE_OUTPUT_PP;
  GPIO_InitStruct.Pin = GPIO_PIN_10;
  HAL_GPIO_Init(GPIOA, &GPIO_InitStruct);
  GPIO_InitStruct.Pin = GPIO_PIN_3 | GPIO_PIN_4 | GPIO_PIN_5;
  HAL_GPIO_Init(GPIOB, &GPIO_InitStruct);
}
`
},
{
  id: 'dc-motor', sec: S5, title: 'DC 모터 속도·방향', tag: 'L298N · H-브리지',
  comps: [{ id: 'm1', type: 'dcmotor', name: 'DC 모터 + L298N', x: 500, y: 240 }],
  wiring: [['m1:ENA', 'B:PA6'], ['m1:IN1', 'B:PB5'], ['m1:IN2', 'B:PB4'], ['m1:+', 'B:5V'], ['m1:-', G]],
  goal: { text: '정방향 150rpm 이상, 역방향 회전까지 하면 완료', check: s => s.rpmMax >= 150 && s.rpmRev },
  overview: `
<p><b>H-브리지</b>(L298N)로 DC 모터의 방향과 속도를 제어해요. IN1/IN2로 방향을, ENA의 PWM 듀티로 속도를 정합니다.</p>
<h4>핵심 개념</h4>
<table><tbody><tr><td>IN1=1, IN2=0</td><td>정방향</td></tr><tr><td>IN1=0, IN2=1</td><td>역방향</td></tr><tr><td>IN1=IN2</td><td>브레이크</td></tr></tbody></table>
<ul>
<li>ENA에 PWM(TIM3_CH1, PA6)을 넣으면 평균 전압이 바뀌어 속도가 달라져요.</li>
<li>실제로는 모터 전원을 별도 배터리(6~12V)로 주고, <b>GND는 MCU와 공통</b>으로 연결해요. 실습에서는 5V로 단순화했어요.</li>
<li>방향을 바꿀 때는 잠시 멈췄다가 바꾸는 게 드라이버와 기어에 좋아요.</li>
</ul>`,
  spec: [['ENA (PWM)', 'PA6 = TIM3_CH1'], ['IN1 / IN2', 'PB5 / PB4'], ['무부하 속도', '약 240rpm (듀티 100%)']],
  code: `#include "main.h"
#include <stdio.h>

void MX_GPIO_Init(void);

void motor(int speed)          // -999 ~ 999
{
  if (speed >= 0)
  {
    HAL_GPIO_WritePin(GPIOB, GPIO_PIN_5, GPIO_PIN_SET);     // IN1
    HAL_GPIO_WritePin(GPIOB, GPIO_PIN_4, GPIO_PIN_RESET);   // IN2
  }
  else
  {
    HAL_GPIO_WritePin(GPIOB, GPIO_PIN_5, GPIO_PIN_RESET);
    HAL_GPIO_WritePin(GPIOB, GPIO_PIN_4, GPIO_PIN_SET);
    speed = -speed;
  }
  __HAL_TIM_SET_COMPARE(&htim3, TIM_CHANNEL_1, speed);     // ENA 듀티
}

int main(void)
{
  HAL_Init();
  SystemClock_Config();
  MX_GPIO_Init();
  MX_USART2_UART_Init();
  MX_TIM3_Init();
  HAL_TIM_PWM_Start(&htim3, TIM_CHANNEL_1);

  while (1)
  {
    for (int s = 0; s <= 999; s += 50) { motor(s); printf("pwm:%d\\r\\n", s); HAL_Delay(100); }
    HAL_Delay(1000);
    motor(0);  HAL_Delay(600);                         // 멈춘 뒤 방향 전환
    for (int s = 0; s <= 999; s += 50) { motor(-s); printf("pwm:%d\\r\\n", -s); HAL_Delay(100); }
    HAL_Delay(1000);
    motor(0);  HAL_Delay(600);
  }
}

void MX_GPIO_Init(void)
{
  GPIO_InitTypeDef GPIO_InitStruct = {0};
  __HAL_RCC_GPIOB_CLK_ENABLE();
  GPIO_InitStruct.Pin = GPIO_PIN_4 | GPIO_PIN_5;
  GPIO_InitStruct.Mode = GPIO_MODE_OUTPUT_PP;
  HAL_GPIO_Init(GPIOB, &GPIO_InitStruct);
}
`
},
{
  id: 'encoder', sec: S5, title: '엔코더로 속도 측정', tag: 'TIM2 엔코더 모드',
  comps: [{ id: 'm1', type: 'dcmotor', name: 'DC 모터 + L298N + 엔코더', x: 500, y: 240 }],
  wiring: [['m1:ENA', 'B:PA6'], ['m1:IN1', 'B:PB5'], ['m1:IN2', 'B:PB4'], ['m1:+', 'B:5V'], ['m1:-', G], ['m1:A', 'B:PA0'], ['m1:B', 'B:PA1']],
  goal: { text: '속도를 10번 이상 측정하면 완료 (바퀴를 끌어 부하를 줘보세요)', check: s => s.serialLines >= 10 && s.rpmMax >= 100 }, plot: true,
  overview: `
<p>모터 축의 <b>쿼드러처 엔코더</b>는 A·B 두 신호를 90° 어긋나게 내보내요. 타이머의 <b>엔코더 모드</b>가 펄스를 하드웨어로 세고 방향까지 판별합니다.</p>
<h4>핵심 개념</h4>
<ul>
<li>이 모터는 11펄스/회전 × 기어 30:1 × <b>4체배</b>(A·B 상승·하강 엣지 모두) = <b>1320카운트/회전</b>.</li>
<li>속도(rpm) = Δ카운트 / 1320 / Δt(초) × 60.</li>
<li>TIM2는 32비트라 오버플로 걱정이 적어요. 16비트 타이머는 Δ계산을 <code>int16_t</code>로 하면 랩어라운드가 자동 처리돼요.</li>
<li>Δt는 µs 타이머(TIM5)로 실제 경과 시간을 재면 정확해요.</li>
<li><b>바퀴를 끌어 부하</b>를 주면 같은 PWM에서도 속도가 떨어져요. 이걸 자동으로 보정하는 게 다음 레슨의 PID예요.</li>
</ul>`,
  spec: [['엔코더 A / B', 'PA0 / PA1 (TIM2 CH1/CH2)'], ['분해능', '1320 카운트/회전 (4체배)'], ['측정 주기', '100ms']],
  code: `#include "main.h"
#include <stdio.h>

#define CPR 1320.0f            // 1회전당 카운트

void MX_GPIO_Init(void);

int main(void)
{
  HAL_Init();
  SystemClock_Config();
  MX_GPIO_Init();
  MX_USART2_UART_Init();
  MX_TIM2_Init();             // 엔코더 모드
  MX_TIM3_Init();             // PWM
  MX_TIM5_Init();             // us 타이머

  HAL_TIM_Encoder_Start(&htim2, TIM_CHANNEL_ALL);
  HAL_TIM_PWM_Start(&htim3, TIM_CHANNEL_1);
  HAL_TIM_Base_Start(&htim5);

  HAL_GPIO_WritePin(GPIOB, GPIO_PIN_5, GPIO_PIN_SET);     // 정방향
  HAL_GPIO_WritePin(GPIOB, GPIO_PIN_4, GPIO_PIN_RESET);
  __HAL_TIM_SET_COMPARE(&htim3, TIM_CHANNEL_1, 600);     // 듀티 60% 고정

  int32_t prev_cnt = 0;
  uint32_t prev_us = 0;
  while (1)
  {
    HAL_Delay(100);
    int32_t cnt = __HAL_TIM_GET_COUNTER(&htim2);
    uint32_t now_us = __HAL_TIM_GET_COUNTER(&htim5);
    float dt = (now_us - prev_us) / 1000000.0f;
    float rpm = (cnt - prev_cnt) / CPR / dt * 60.0f;
    prev_cnt = cnt;
    prev_us = now_us;
    printf("rpm:%.1f\\r\\n", rpm);
  }
}

void MX_GPIO_Init(void)
{
  GPIO_InitTypeDef GPIO_InitStruct = {0};
  __HAL_RCC_GPIOB_CLK_ENABLE();
  GPIO_InitStruct.Pin = GPIO_PIN_4 | GPIO_PIN_5;
  GPIO_InitStruct.Mode = GPIO_MODE_OUTPUT_PP;
  HAL_GPIO_Init(GPIOB, &GPIO_InitStruct);
}
`
},
{
  id: 'pid-speed', sec: S5, title: 'PID 속도 제어', tag: '폐루프 · 튜닝',
  comps: [{ id: 'm1', type: 'dcmotor', name: 'DC 모터 + L298N + 엔코더', x: 500, y: 240 }],
  wiring: [['m1:ENA', 'B:PA6'], ['m1:IN1', 'B:PB5'], ['m1:IN2', 'B:PB4'], ['m1:+', 'B:5V'], ['m1:-', G], ['m1:A', 'B:PA0'], ['m1:B', 'B:PA1']],
  goal: { text: '부하 30% 이상에서도 120±6rpm을 1초 이상 유지하면 완료', check: s => s.holdMax >= 1 }, plot: true,
  overview: `
<p>목표 속도(120rpm)와 실제 속도의 차이(오차)로 PWM을 자동 조절해요. <b>바퀴를 끌어 부하를 줘도</b> 속도가 유지되는지 플로터로 확인하세요.</p>
<h4>PID 식</h4>
<pre class="snip">오차 e = 목표 − 측정
출력 u = Kp·e + Ki·∫e dt + Kd·de/dt</pre>
<ul>
<li><b>P(비례)</b>: 오차에 비례해 즉시 반응. 크면 빠르지만 진동해요. P만으로는 부하가 있을 때 <b>정상상태 오차</b>가 남아요.</li>
<li><b>I(적분)</b>: 오차를 누적해 정상상태 오차를 없애요. 크면 오버슈트·진동. 출력이 포화될 때 적분이 계속 쌓이는 <b>와인드업</b>을 제한해야 해요.</li>
<li><b>D(미분)</b>: 변화율로 급변을 억제해요. 노이즈에 민감해서 작게 써요.</li>
<li>제어 주기는 <b>타이머 인터럽트(TIM11, 10ms)</b>로 일정하게 맞춰요.</li>
</ul>
<h4>튜닝 순서 (해보기)</h4>
<ol><li>Ki=0, Kd=0, Kp만 키우며 반응을 봐요. 부하를 주면 목표에 못 미치는 걸 확인해요.</li><li>Ki를 올려 오차를 없애요. 너무 크면 출렁여요.</li><li>필요하면 Kd를 조금 넣어 오버슈트를 줄여요.</li><li>코드 위쪽의 Kp·Ki·Kd를 바꾸고 다시 실행하세요.</li></ol>`,
  spec: [['제어 주기', '10ms (TIM11 인터럽트)'], ['목표', '120rpm'], ['출력', 'TIM3 CH1 듀티 0~999'], ['적분 제한', '±80']],
  code: `#include "main.h"
#include <stdio.h>

#define CPR         1320.0f    // 엔코더 1회전 카운트 (11 × 30 × 4)
#define TARGET_RPM  120.0f

// ▼ 이 값을 바꿔가며 튜닝해보세요
float Kp = 3.0f;
float Ki = 12.0f;
float Kd = 0.02f;

volatile int tick10ms = 0;
float integral = 0, prev_err = 0;
int32_t prev_cnt = 0;
uint32_t prev_us = 0;

void MX_GPIO_Init(void);

void HAL_TIM_PeriodElapsedCallback(TIM_HandleTypeDef *htim)
{
  if (htim->Instance == TIM11) tick10ms = 1;     // 10ms마다 제어 주기 알림
}

void motor_pwm(float duty)
{
  if (duty > 999) duty = 999;
  if (duty < 0) duty = 0;
  __HAL_TIM_SET_COMPARE(&htim3, TIM_CHANNEL_1, duty);
}

int main(void)
{
  HAL_Init();
  SystemClock_Config();
  MX_GPIO_Init();
  MX_USART2_UART_Init();
  MX_TIM2_Init();    // 엔코더
  MX_TIM3_Init();    // PWM
  MX_TIM5_Init();    // us 타이머
  MX_TIM11_Init();   // 10ms 주기 인터럽트

  HAL_TIM_Encoder_Start(&htim2, TIM_CHANNEL_ALL);
  HAL_TIM_PWM_Start(&htim3, TIM_CHANNEL_1);
  HAL_TIM_Base_Start(&htim5);
  HAL_TIM_Base_Start_IT(&htim11);

  HAL_GPIO_WritePin(GPIOB, GPIO_PIN_5, GPIO_PIN_SET);     // IN1 정방향
  HAL_GPIO_WritePin(GPIOB, GPIO_PIN_4, GPIO_PIN_RESET);   // IN2

  int n = 0;
  while (1)
  {
    if (!tick10ms) continue;
    tick10ms = 0;

    // 1) 속도 측정
    uint32_t now_us = __HAL_TIM_GET_COUNTER(&htim5);
    int32_t cnt = __HAL_TIM_GET_COUNTER(&htim2);
    float dt = (now_us - prev_us) / 1000000.0f;
    float rpm = (cnt - prev_cnt) / CPR / dt * 60.0f;
    prev_us = now_us;
    prev_cnt = cnt;
    if (dt <= 0 || dt > 0.1f) continue;          // 첫 주기는 건너뜀

    // 2) PID 계산
    float err = TARGET_RPM - rpm;
    integral += err * dt;
    if (integral > 80) integral = 80;            // 적분 와인드업 제한
    if (integral < -80) integral = -80;
    float deriv = (err - prev_err) / dt;
    prev_err = err;
    float out = Kp * err + Ki * integral + Kd * deriv;

    // 3) 출력
    motor_pwm(out);

    if (++n % 5 == 0)
      printf("target:%.0f,rpm:%.1f,pwm:%.0f\\r\\n", TARGET_RPM, rpm, out / 10);
  }
}

void MX_GPIO_Init(void)
{
  GPIO_InitTypeDef GPIO_InitStruct = {0};
  __HAL_RCC_GPIOB_CLK_ENABLE();
  GPIO_InitStruct.Pin = GPIO_PIN_4 | GPIO_PIN_5;
  GPIO_InitStruct.Mode = GPIO_MODE_OUTPUT_PP;
  HAL_GPIO_Init(GPIOB, &GPIO_InitStruct);
}
`
},
{
  id: 'pid-position', sec: S5, title: 'PID 위치 제어', tag: '엔코더 · PD 제어',
  comps: [{ id: 'm1', type: 'dcmotor', name: 'DC 모터 + L298N + 엔코더', x: 500, y: 240 }],
  wiring: [['m1:ENA', 'B:PA6'], ['m1:IN1', 'B:PB5'], ['m1:IN2', 'B:PB4'], ['m1:+', 'B:5V'], ['m1:-', G], ['m1:A', 'B:PA0'], ['m1:B', 'B:PA1']],
  goal: { text: '360° 목표에 ±5° 안으로 0.5초 이상 멈추면 완료', check: s => s.posHoldMax >= .5 }, plot: true,
  overview: `
<p>DC 모터를 서보처럼 <b>원하는 각도</b>로 보내요. 엔코더로 위치를 재고, 오차의 부호에 따라 방향을, 크기에 따라 PWM을 정합니다. 목표는 3초마다 0° ↔ 360°로 바뀌어요.</p>
<h4>핵심 개념</h4>
<ul>
<li>위치(°) = 카운트 / 1320 × 360.</li>
<li>위치 제어는 보통 <b>P + D</b>로 시작해요. D가 감속을 도와 오버슈트를 줄여요.</li>
<li><b>측정값 미분</b>: 목표가 갑자기 바뀔 때 생기는 미분 킥을 막으려고 오차 대신 측정값의 변화율을 써요.</li>
<li>부하(바퀴 끌기)를 주면 마찰처럼 작용해 목표 근처에서 멈춰버려요(데드존). 이때 작은 <b>Ki</b>가 필요해요.</li>
</ul>
<h4>도전</h4>
<p>부하 30%를 준 상태에서 ±2° 안에 들어오도록 Ki를 추가하고 튜닝해보세요.</p>`,
  spec: [['분해능', '1320 카운트 = 360°'], ['제어 주기', '10ms'], ['출력 범위', '±999 (방향 + 듀티)']],
  code: `#include "main.h"
#include <stdio.h>

#define CPR 1320.0f

float Kp = 4.0f;     // duty / 도
float Ki = 0.0f;
float Kd = 0.25f;    // duty / (도/s)

volatile int tick10ms = 0;
float target_deg = 0, integral = 0, prev_deg = 0;
uint32_t prev_us = 0;

void MX_GPIO_Init(void);

void HAL_TIM_PeriodElapsedCallback(TIM_HandleTypeDef *htim)
{
  if (htim->Instance == TIM11) tick10ms = 1;
}

void motor(float u)            // u: -999 ~ 999
{
  if (u >= 0)
  {
    HAL_GPIO_WritePin(GPIOB, GPIO_PIN_5, GPIO_PIN_SET);
    HAL_GPIO_WritePin(GPIOB, GPIO_PIN_4, GPIO_PIN_RESET);
  }
  else
  {
    HAL_GPIO_WritePin(GPIOB, GPIO_PIN_5, GPIO_PIN_RESET);
    HAL_GPIO_WritePin(GPIOB, GPIO_PIN_4, GPIO_PIN_SET);
    u = -u;
  }
  if (u > 999) u = 999;
  __HAL_TIM_SET_COMPARE(&htim3, TIM_CHANNEL_1, u);
}

int main(void)
{
  HAL_Init();
  SystemClock_Config();
  MX_GPIO_Init();
  MX_USART2_UART_Init();
  MX_TIM2_Init();
  MX_TIM3_Init();
  MX_TIM5_Init();
  MX_TIM11_Init();
  HAL_TIM_Encoder_Start(&htim2, TIM_CHANNEL_ALL);
  HAL_TIM_PWM_Start(&htim3, TIM_CHANNEL_1);
  HAL_TIM_Base_Start(&htim5);
  HAL_TIM_Base_Start_IT(&htim11);

  uint32_t last_switch = HAL_GetTick();
  int n = 0;
  while (1)
  {
    if (HAL_GetTick() - last_switch > 3000)       // 3초마다 목표 변경
    {
      target_deg = (target_deg == 0) ? 360 : 0;
      last_switch = HAL_GetTick();
    }
    if (!tick10ms) continue;
    tick10ms = 0;

    uint32_t now_us = __HAL_TIM_GET_COUNTER(&htim5);
    float dt = (now_us - prev_us) / 1000000.0f;
    prev_us = now_us;
    if (dt <= 0 || dt > 0.1f) continue;

    int32_t cnt = __HAL_TIM_GET_COUNTER(&htim2);
    float deg = cnt / CPR * 360.0f;
    float err = target_deg - deg;
    integral += err * dt;
    float d_meas = (deg - prev_deg) / dt;         // 측정값 미분
    prev_deg = deg;

    float u = Kp * err + Ki * integral - Kd * d_meas;
    motor(u);

    if (++n % 5 == 0)
      printf("target:%.0f,deg:%.1f\\r\\n", target_deg, deg);
  }
}

void MX_GPIO_Init(void)
{
  GPIO_InitTypeDef GPIO_InitStruct = {0};
  __HAL_RCC_GPIOB_CLK_ENABLE();
  GPIO_InitStruct.Pin = GPIO_PIN_4 | GPIO_PIN_5;
  GPIO_InitStruct.Mode = GPIO_MODE_OUTPUT_PP;
  HAL_GPIO_Init(GPIOB, &GPIO_InitStruct);
}
`
},
{
  id: 'bldc', sec: S5, title: 'BLDC 모터와 ESC', tag: 'TIM1 · 50Hz 스로틀',
  comps: [{ id: 'esc1', type: 'esc', name: 'BLDC 모터 + ESC', x: 540, y: 240 }],
  wiring: [['esc1:S', 'B:PA8'], ['esc1:-', G]],
  goal: { text: 'ESC를 시동하고 4000rpm 이상 돌리면 완료', check: s => s.escArmed && s.escMax >= 4000 },
  overview: `
<p>드론·RC카의 <b>BLDC 모터</b>는 브러시가 없어 3상 전류를 전자적으로 바꿔줘야 해요. 그 일을 하는 게 <b>ESC</b>(전자 속도 제어기)이고, MCU는 서보와 같은 <b>50Hz 펄스</b>로 스로틀만 알려줘요.</p>
<h4>핵심 개념</h4>
<ul>
<li>펄스 1000µs = 정지(최저), 2000µs = 최고 속도.</li>
<li><b>암(arming)</b>: 안전을 위해 ESC는 전원을 켠 뒤 최저 스로틀(1000µs)을 1~2초 받아야 동작해요. 처음부터 높은 값을 주면 돌지 않아요.</li>
<li>ESC 전원은 배터리(이 실습에서는 내장으로 가정), 신호 GND는 MCU와 공통으로 연결해요.</li>
<li>센서드 BLDC를 MCU가 직접 구동하려면 홀센서 + 6스텝 정류나 FOC가 필요해요. 고급 주제입니다.</li>
</ul>
<h4>주의</h4>
<p>실제 프로펠러는 매우 위험해요. 테스트할 때는 프로펠러를 빼세요.</p>`,
  spec: [['신호', 'PA8 = TIM1_CH1, 50Hz'], ['스로틀', '1000~2000µs'], ['암 조건', '1000µs 약 1.5초 유지']],
  code: `#include "main.h"
#include <stdio.h>

void esc_us(uint32_t us)        // 1000 ~ 2000
{
  __HAL_TIM_SET_COMPARE(&htim1, TIM_CHANNEL_1, us);
}

int main(void)
{
  HAL_Init();
  SystemClock_Config();
  MX_USART2_UART_Init();
  MX_TIM1_Init();                       // 1us 단위, 50Hz
  HAL_TIM_PWM_Start(&htim1, TIM_CHANNEL_1);

  printf("ESC 시동: 최저 스로틀 2초 유지\\r\\n");
  esc_us(1000);
  HAL_Delay(2000);

  while (1)
  {
    printf("가속\\r\\n");
    for (int us = 1000; us <= 1600; us += 10) { esc_us(us); HAL_Delay(40); }
    HAL_Delay(2000);
    printf("감속\\r\\n");
    for (int us = 1600; us >= 1000; us -= 10) { esc_us(us); HAL_Delay(40); }
    HAL_Delay(1500);
  }
}
`
},

/* ================= 종합 ================= */
{
  id: 'traffic', sec: S6, title: '보행자 신호등', tag: '상태 기계 · 종합',
  comps: [
    { id: 'ledR', type: 'led', color: 'red', name: '빨강', x: 470, y: 130 },
    { id: 'ledY', type: 'led', color: 'yellow', name: '노랑', x: 600, y: 130 },
    { id: 'ledG', type: 'led', color: 'green', name: '초록', x: 730, y: 130 },
    { id: 'btn1', type: 'button', name: '보행자 버튼', x: 600, y: 420 }
  ],
  wiring: [
    ['ledR:+', 'B:PB5'], ['ledY:+', 'B:PB4'], ['ledG:+', 'B:PB10'],
    ['ledR:-', G], ['ledY:-', G], ['ledG:-', G],
    ['btn1:S', 'B:PA10'], ['btn1:+', 'B:3V3'], ['btn1:-', G]
  ],
  goal: { text: '버튼을 눌러 빨강·노랑·초록이 모두 한 번씩 켜지면 완료', check: s => s.presses >= 1 && s.ledEdges.ledR >= 1 && s.ledEdges.ledY >= 1 && s.ledEdges.ledG >= 1 },
  overview: `
<p>차량 신호등 3색 LED와 보행자 버튼을 연결합니다. 평소엔 초록불, 버튼을 누르면 노랑 → 빨강으로 바뀌고 일정 시간 뒤 초록으로 돌아와요.</p>
<h4>배선</h4>
<ul><li>빨강 → <b>D4(PB5)</b>, 노랑 → <b>D5(PB4)</b>, 초록 → <b>D6(PB10)</b></li><li>버튼 S → <b>D2(PA10)</b>, + → 3V3, − → GND</li></ul>
<h4>핵심 개념</h4>
<ul>
<li><b>상태 기계</b>: 현재 상태를 변수로 두고 조건에 따라 다음 상태로 넘어가요.</li>
<li>여러 핀을 한 번에 다룰 때 <code>GPIO_PIN_4 | GPIO_PIN_5</code>처럼 OR로 묶어요.</li>
</ul>
<h4>도전</h4>
<p>HAL_Delay 대신 HAL_GetTick으로 시간을 재서, 빨간불 동안에도 버튼·시리얼에 반응하는 논블로킹 구조로 바꿔보세요.</p>`,
  spec: [['빨강 / 노랑 / 초록', 'PB5 / PB4 / PB10'], ['버튼', 'PA10, 누르면 HIGH']],
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
},
{
  id: 'sandbox', sec: S6, title: '자유 실습', tag: '부품 15종 자유 배치', sandbox: true,
  comps: [], wiring: [],
  overview: `
<p>모든 부품을 자유롭게 꺼내 배선하고 코드를 짜보세요. 레슨에서 배운 걸 섞어 나만의 프로젝트를 만들 수 있어요.</p>
<h4>사용법</h4>
<ol><li>작업대 위쪽 <b>부품</b> 목록에서 고르고 <b>부품 추가</b>를 누르세요.</li><li>부품 몸체를 끌어 옮기고, 오른쪽 위 ×로 삭제해요.</li><li>핀맵 탭의 <b>주변장치 핀 배정</b> 표를 보고 PWM·ADC·I2C·엔코더 핀에 맞춰 배선하세요.</li></ol>
<h4>프로젝트 아이디어</h4>
<ul>
<li>초음파 + 부저: 후방 주차 센서</li>
<li>DHT11 + LCD: 온습도계</li>
<li>가변저항 + 서보: 수동 조종 로봇 팔 관절</li>
<li>엔코더 모터 + OLED: 속도 PID 상태 표시기</li>
<li>버튼 + 스텝 모터 + 7세그먼트: 층 선택 엘리베이터</li>
</ul>`,
  code: `#include "main.h"
#include <stdio.h>

// 자유 실습: 부품을 추가하고, 배선한 핀에 맞게 코드를 작성하세요.
// 필요한 초기화 예: MX_TIM1_Init(); MX_TIM3_Init(); MX_ADC1_Init(); MX_I2C1_Init();

void MX_GPIO_Init(void);

int main(void)
{
  HAL_Init();
  SystemClock_Config();
  MX_GPIO_Init();
  MX_USART2_UART_Init();

  printf("자유 실습 시작\\r\\n");
  while (1)
  {
    HAL_GPIO_TogglePin(GPIOA, GPIO_PIN_5);
    HAL_Delay(500);
  }
}

void MX_GPIO_Init(void)
{
  GPIO_InitTypeDef GPIO_InitStruct = {0};
  __HAL_RCC_GPIOA_CLK_ENABLE();
  __HAL_RCC_GPIOB_CLK_ENABLE();
  __HAL_RCC_GPIOC_CLK_ENABLE();

  GPIO_InitStruct.Pin = GPIO_PIN_5;
  GPIO_InitStruct.Mode = GPIO_MODE_OUTPUT_PP;
  HAL_GPIO_Init(GPIOA, &GPIO_InitStruct);
}
`
}
];
})();
