#include <Adafruit_Protomatter.h>
#include <ArtronShop_SHT3x.h>
#include <WiFi.h>
#include <WebSocketsClient.h>
#include <freertos/FreeRTOS.h>
#include <freertos/task.h>

// ─── Matrix pins ─────────────────────────────────────────────────────────────
uint8_t rgbPins[]  = {42, 41, 40, 38, 39, 37};
uint8_t addrPins[] = {45, 36, 48, 35, 21};
uint8_t clockPin   = 2;
uint8_t latchPin   = 47;
uint8_t oePin      = 14;

Adafruit_Protomatter matrix(
  64, 4,
  1, rgbPins,
  5, addrPins,
  clockPin, latchPin, oePin,
  true);


ArtronShop_SHT3x sht3x(0x44, &Wire);

// ─── Buttons ──────────────────────────────────────────────────────────────────
//#define BTN_UP   6
//#define BTN_DOWN 7
#define BTN_UP   10
#define BTN_DOWN 11


// ─── WiFi / WebSocket config ──────────────────────────────────────────────────
struct WifiNetwork {
  const char* ssid;
  const char* password;
};
const WifiNetwork wifiNetworks[] = {
  { "VilhelmKiers_WiFi", "Kiers123456"   },
  { "dlink-02C8",        "Skovvejen123"  },
};
const int WIFI_NETWORK_COUNT = sizeof(wifiNetworks) / sizeof(wifiNetworks[0]);

/* ── LOCAL TEST: set WS_HOST to your laptop's IP on the same WiFi ─────────────
const char* WS_HOST = "192.168.0.104";  // <-- update to your laptop's IP
const int   WS_PORT = 3000;             // same port as Next.js
const char* WS_PATH = "/ws";            // WebSocket endpoint path
*/
// ── PRODUCTION (Cloudflare Tunnel) ───────────────────────────────────────────
const char* WS_HOST = "vkmotion.site";
const int   WS_PORT = 443;
const char* WS_PATH = "/ws";

// ─── App states ───────────────────────────────────────────────────────────────
enum AppState { STATE_COUNTER, STATE_CLEANING };
AppState appState = STATE_COUNTER;

// ─── Counter ──────────────────────────────────────────────────────────────────
int  counter       = 0;
bool lastUpState   = HIGH;
bool lastDownState = HIGH;

// ─── Global colors (computed once in setup) ───────────────────────────────────
uint16_t COL_WHITE;
uint16_t COL_BLACK;
uint16_t COL_TEMP;        // orange — temperature
uint16_t COL_HUM;         // blue   — humidity
uint16_t COL_DIM_WHITE;   // sensor box border
uint16_t COL_YELLOW;      // duck / cleaning header
uint16_t COL_CYAN;        // progress bar / scroll text
uint16_t COL_GREY;        // cleaning header bar
uint16_t COL_BROWN;       // scroll hint text
uint16_t COL_DUCK_DARK;   // duck shadow/wing
uint16_t COL_DUCK_BEAK;   // duck beak orange-red
uint16_t COL_BAR_BG;      // progress bar background
uint16_t COL_ICON_GRAY;   // wifi bars
uint16_t COL_ICON_RED;    // slash / break color
uint16_t COL_ICON_GOLD;   // chain link gold
uint16_t COL_WS_SPIN;     // websocket spinner

// ─── Sensor ───────────────────────────────────────────────────────────────────
volatile float sharedTemp  = 0;
volatile float sharedHum   = 0;
volatile bool  sensorReady = false;
float lastTemp = 0;
float lastHum  = 0;

// ─── WebSocket shared state ───────────────────────────────────────────────────
volatile bool wsDataDirty     = false;
volatile int  wsCounter       = 0;
volatile bool wsCleaningState = false;
volatile bool wifiConnected   = false;
volatile bool wsConnected     = false;

bool          isConnected   = false;
unsigned long lastHeartbeat = 0;
unsigned long lastSend      = 0;
unsigned long lastWifiCheck = 0;

constexpr unsigned long HEARTBEAT_INTERVAL  = 30000;
constexpr unsigned long SEND_COOLDOWN       = 500;
constexpr unsigned long WIFI_CHECK_INTERVAL = 15000;

WebSocketsClient webSocket;

// ─── Ripple state ─────────────────────────────────────────────────────────────
bool          rippleActive   = false;
int           rippleFrame    = 0;
int           rippleDir      = 1;
unsigned long lastRippleTime = 0;
const int     rippleInterval = 20;
const int     rippleStartR   = 19;
const int     rippleMaxR     = 42;
const int     rippleRingGap  = 5;

// ─── Circle animation state ───────────────────────────────────────────────────
bool          circleAnimActive   = false;
int           circleAnimFrame    = 0;
unsigned long lastCircleTime     = 0;
const int     circleAnimInterval = 25;

// ─── Long press state ─────────────────────────────────────────────────────────
bool          longHeld          = false;
unsigned long longHeldStart     = 0;
bool          waitingForRelease = false;

// ─── Scrolling text ───────────────────────────────────────────────────────────
int           scrollX        = 64;
unsigned long lastScrollTime = 0;
const int     scrollInterval = 50;

// ─── Twinkle state ────────────────────────────────────────────────────────────
struct Twinkle {
  int     x, y;
  uint8_t brightness;
  uint8_t hue;
};
const int TWINKLE_COUNT = 18;
Twinkle   twinkles[TWINKLE_COUNT];
bool      twinkleInit = false;

// ─── WS spinner state ─────────────────────────────────────────────────────────
int           wsSpinAngle    = 0;
unsigned long lastSpinTime   = 0;
const int     spinInterval   = 100;  // ms per step

// ═══════════════════════════════════════════════════════════════════════════════
// WebSocket
// ═══════════════════════════════════════════════════════════════════════════════

void webSocketEvent(WStype_t type, uint8_t* payload, size_t length) {
  switch (type) {
    case WStype_DISCONNECTED:
      Serial.println("[WS] Disconnected");
      isConnected = false;
      wsConnected = false;
      break;
    case WStype_CONNECTED:
      Serial.println("[WS] Connected");
      isConnected = true;
      wsConnected = true;
      wsDataDirty = true;
      break;
    case WStype_TEXT:
      Serial.printf("[WS] Received: %.*s\n", (int)length, payload);
      break;
    case WStype_ERROR:
      Serial.println("[WS] Error");
      wsConnected = false;
      break;
    default:
      break;
  }
}

void sendWsData(bool force) {
  unsigned long now = millis();
  if (!force && (now - lastSend) < SEND_COOLDOWN) return;
  lastSend = now;
  if (!isConnected) return;

  char msg[128];
  snprintf(msg, sizeof(msg),
    "{\"counter\":%d,\"state\":\"%s\",\"temp\":%.1f,\"humidity\":%.1f}",
    (int)wsCounter,
    wsCleaningState ? "cleaning" : "counter",
    (float)sharedTemp,
    (float)sharedHum
  );
  webSocket.sendTXT(msg);
  Serial.printf("[WS] Sent: %s\n", msg);
  wsDataDirty = false;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Core 0 tasks
// ═══════════════════════════════════════════════════════════════════════════════

void sensorTask(void* parameter) {
  Wire.begin();
  while (!sht3x.begin()) {
    Serial.println("[Sensor] SHT3x not found!");
    vTaskDelay(1000 / portTICK_PERIOD_MS);
  }
  sensorReady = true;
  Serial.println("[Sensor] Ready");
  for (;;) {
    if (sht3x.measure()) {
      sharedTemp = sht3x.temperature();
      sharedHum  = sht3x.humidity();
    }
    vTaskDelay(5000 / portTICK_PERIOD_MS);
  }
}

void networkTask(void* parameter) {
  auto connectWifi = []() {
    for (;;) {
      for (int i = 0; i < WIFI_NETWORK_COUNT; i++) {
        Serial.printf("[WiFi] Trying: %s\n", wifiNetworks[i].ssid);
        WiFi.disconnect();
        WiFi.begin(wifiNetworks[i].ssid, wifiNetworks[i].password);
        unsigned long start = millis();
        while (WiFi.status() != WL_CONNECTED && millis() - start < 8000) {
          vTaskDelay(500 / portTICK_PERIOD_MS);
          Serial.print('.');
        }
        if (WiFi.status() == WL_CONNECTED) {
          Serial.printf("\n[WiFi] Connected to: %s  IP: %s\n",
            wifiNetworks[i].ssid, WiFi.localIP().toString().c_str());
          wifiConnected = true;
          return;
        }
        Serial.printf("\n[WiFi] Failed: %s\n", wifiNetworks[i].ssid);
      }
      Serial.println("[WiFi] All networks failed, retrying...");
      vTaskDelay(2000 / portTICK_PERIOD_MS);
    }
  };

  connectWifi();
  webSocket.beginSSL(WS_HOST, WS_PORT, WS_PATH);
  webSocket.onEvent(webSocketEvent);
  webSocket.setReconnectInterval(5000);

  for (;;) {
    webSocket.loop();
    unsigned long now = millis();

    if (now - lastWifiCheck >= WIFI_CHECK_INTERVAL) {
      lastWifiCheck = now;
      if (WiFi.status() != WL_CONNECTED) {
        wifiConnected = false;
        wsConnected   = false;
        Serial.println("[WiFi] Lost – scanning all networks");
        connectWifi();
        webSocket.disconnect();
        webSocket.beginSSL(WS_HOST, WS_PORT, WS_PATH);
      } else {
        wifiConnected = true;
      }
    }

    if (now - lastHeartbeat >= HEARTBEAT_INTERVAL) {
      lastHeartbeat = now;
      if (isConnected) {
        char msg[32];
        snprintf(msg, sizeof(msg), "{\"heartbeat\":%lu}", now);
        webSocket.sendTXT(msg);
        Serial.println("[WS] Heartbeat sent");
      }
    }

    if (wsDataDirty) sendWsData(false);
    vTaskDelay(5 / portTICK_PERIOD_MS);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Ripple
// ═══════════════════════════════════════════════════════════════════════════════

void triggerRipple(bool increment) {
  rippleActive   = true;
  rippleFrame    = 0;
  lastRippleTime = millis();
  rippleDir      = increment ? 1 : -1;
}

uint16_t ripplePixelColor(int dx, int dy, int frame) {
  float   angle = atan2f((float)dy, (float)dx);
  uint8_t a     = (uint8_t)((angle + 3.14159f) / 6.28318f * 255.0f);
  a = (uint8_t)(a + frame * 18);
  uint8_t r, g, b;
  if (rippleDir > 0) {
    r = (a < 128) ? (a * 2) : 0;
    g = 200 + (a % 55);
    b = (a > 180) ? ((a - 180) * 3) : 0;
  } else {
    r = 200 + (a % 55);
    g = (a < 100) ? (uint8_t)(a * 1.2f) : 0;
    b = (a > 160) ? ((a - 160) * 2) : 0;
  }
  return matrix.color565(r, g, b);
}

void drawCircleClipped(int cx, int cy, int r, int frame) {
  int x = 0, y = r, d = 3 - 2 * r;

  // Pre-calculate sensor box bounds to allow gap between them
  char tempBuf[10];
  snprintf(tempBuf, sizeof(tempBuf), "%d", (int)roundf(lastTemp));
  int numW     = strlen(tempBuf) * 6;
  int tempBoxW = numW + 3 + 6 + 5;

  char humBuf[8];
  snprintf(humBuf, sizeof(humBuf), "%.0f%%", (double)lastHum);
  int humBoxW  = strlen(humBuf) * 6 + 3;
  int humBoxX  = matrix.width() - humBoxW;

  auto plotPoints = [&](int px, int py) {
    int pts[8][2] = {
      {cx+px, cy+py}, {cx-px, cy+py},
      {cx+px, cy-py}, {cx-px, cy-py},
      {cx+py, cy+px}, {cx-py, cy+px},
      {cx+py, cy-px}, {cx-py, cy-px}
    };
    for (auto& p : pts) {
      int sx = p[0];
      int sy = p[1];
      if (sy < 0 || sy >= matrix.height()) continue;

      // Block only pixels that land inside either sensor box
      bool inTempBox = (sy >= 53 && sx >= 0      && sx < tempBoxW);
      bool inHumBox  = (sy >= 53 && sx >= humBoxX && sx < matrix.width());
      if (inTempBox || inHumBox) continue;

      int dx = sx - cx;
      int dy = sy - cy;
      matrix.drawPixel(sx, sy, ripplePixelColor(dx, dy, frame));
    }
  };

  while (x <= y) {
    plotPoints(x, y);
    if (d < 0) d += 4 * x + 6;
    else { d += 4 * (x - y) + 10; y--; }
    x++;
  }
}

void drawRippleFrame() {
  int cx = matrix.width() / 2;
  int cy = 26;
  for (int ring = 0; ring < 4; ring++) {
    int f = rippleFrame - (ring * rippleRingGap);
    if (f < 0) continue;
    int r = rippleStartR + f;
    if (r > rippleMaxR) continue;
    drawCircleClipped(cx, cy, r, rippleFrame + ring * 40);
  }
}

void triggerCircleAnim() {
  circleAnimActive = true;
  circleAnimFrame  = 0;
  lastCircleTime   = millis();
}

// ═══════════════════════════════════════════════════════════════════════════════
// Status icons
// ═══════════════════════════════════════════════════════════════════════════════

void drawStatusIcons(unsigned long now) {
  if (appState == STATE_CLEANING) return;

  // ── WiFi — signal bars + slash, top LEFT ──────────────────────
  if (!wifiConnected) {
    matrix.drawFastVLine(2, 7, 1, COL_ICON_GRAY);
    matrix.drawFastVLine(4, 5, 3, COL_ICON_GRAY);
    matrix.drawFastVLine(6, 3, 5, COL_ICON_GRAY);
    matrix.drawFastVLine(8, 1, 7, COL_ICON_GRAY);
  }

  // ── WS — bold "E", top RIGHT ─────────────────────────────────
  if (!wsConnected) {
    uint16_t wsGreen = matrix.color565(0, 100, 40);  // dark green

    matrix.setTextSize(1);
    matrix.setTextColor(wsGreen);
    matrix.setCursor(matrix.width() - 7, 1);  matrix.print("E");
    matrix.setCursor(matrix.width() - 6, 1);  matrix.print("E");  // bold offset
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Counter screen
// ═══════════════════════════════════════════════════════════════════════════════

void drawCounter(int val) {
  int cx    = matrix.width() / 2;
  int cy    = 26;
  int baseR = 18;

  int r = baseR;
  if (circleAnimActive && circleAnimFrame < 17) {
    r = (circleAnimFrame < 9)
      ? baseR + circleAnimFrame / 2
      : baseR + (16 - circleAnimFrame) / 2;
  }

  matrix.fillCircle(cx, cy, r, COL_WHITE);

  matrix.setTextSize(3);
  matrix.setTextColor(COL_BLACK);
  char buf[8];
  snprintf(buf, sizeof(buf), "%d", val);
  int textW = strlen(buf) * 18;
  matrix.setCursor(cx - (textW / 2) + 2, cy - 12 + 2);
  matrix.print(val);
}

void drawSensors(float temp, float hum) {
  matrix.setTextSize(1);

  char tempBuf[10];
  snprintf(tempBuf, sizeof(tempBuf), "%d", (int)roundf(temp));
  int numW = strlen(tempBuf) * 6;
  int boxW = numW + 3 + 6 + 5 + 0;  // padding + number + degree(4px) + C(6px) + padding

  matrix.drawRoundRect(0, 53, boxW, 11, 2, COL_DIM_WHITE);
  matrix.setTextColor(COL_TEMP);
  matrix.setCursor(2, 55);
  matrix.print(tempBuf);

  // Degree symbol — tiny 2x2 circle drawn manually after the number
  int degX = 2 + numW + 1;
  int degY = 55;
  matrix.drawPixel(degX + 1, degY,     COL_TEMP);  // top
  matrix.drawPixel(degX,     degY + 1, COL_TEMP);  // left
  matrix.drawPixel(degX + 2, degY + 1, COL_TEMP);  // right
  matrix.drawPixel(degX + 1, degY + 2, COL_TEMP);  // bottom

  // C after degree symbol
  matrix.setCursor(degX + 4, 55);
  matrix.print("C");

  char humBuf[8];
  snprintf(humBuf, sizeof(humBuf), "%.0f%%", hum);
  int humBoxW = strlen(humBuf) * 6 + 3;
  int humBoxX = matrix.width() - humBoxW;
  matrix.drawRoundRect(humBoxX, 53, humBoxW, 11, 2, COL_DIM_WHITE);
  matrix.setTextColor(COL_HUM);
  matrix.setCursor(humBoxX + 2, 55);
  matrix.print(humBuf);
}
// ═══════════════════════════════════════════════════════════════════════════════
// Cleaning screen
// ═══════════════════════════════════════════════════════════════════════════════

uint16_t hueToColor(uint8_t hue) {
  uint8_t r, g, b;
  uint8_t sector = hue / 43;
  uint8_t offset = (hue % 43) * 6;
  switch (sector) {
    case 0: r = 255;          g = offset;       b = 0;            break;
    case 1: r = 255 - offset; g = 255;          b = 0;            break;
    case 2: r = 0;            g = 255;          b = offset;       break;
    case 3: r = 0;            g = 255 - offset; b = 255;          break;
    case 4: r = offset;       g = 0;            b = 255;          break;
    default:r = 255;          g = 0;            b = 255 - offset; break;
  }
  return matrix.color565(r, g, b);
}

uint16_t dimColor(uint16_t col, uint8_t brightness) {
  uint8_t r = ((col >> 11) & 0x1F) * brightness / 7;
  uint8_t g = ((col >> 5)  & 0x3F) * brightness / 7;
  uint8_t b = ( col        & 0x1F) * brightness / 7;
  return (r << 11) | (g << 6) | b;
}

void initTwinkles() {
  for (int i = 0; i < TWINKLE_COUNT; i++) {
    twinkles[i].x          = random(0, matrix.width());
    twinkles[i].y          = random(10, 52);
    twinkles[i].brightness = random(1, 8);
    twinkles[i].hue        = random(0, 256);
  }
  twinkleInit = true;
}

void tickTwinkles() {
  for (int i = 0; i < TWINKLE_COUNT; i++) {
    if (twinkles[i].brightness == 0) {
      twinkles[i].x          = random(0, matrix.width());
      twinkles[i].y          = random(10, 52);
      twinkles[i].brightness = 7;
      twinkles[i].hue        = random(0, 256);
    } else {
      twinkles[i].brightness--;
    }
  }
}

void drawTwinkles() {
  int duckCx = matrix.width() / 2 + 1;
  int duckCy = 32;
  int clearR  = 16;
  for (int i = 0; i < TWINKLE_COUNT; i++) {
    if (twinkles[i].brightness == 0) continue;
    int dx = twinkles[i].x - duckCx;
    int dy = twinkles[i].y - duckCy;
    if ((dx * dx + dy * dy) <= (clearR * clearR)) continue;
    uint16_t col = dimColor(hueToColor(twinkles[i].hue), twinkles[i].brightness);
    matrix.drawPixel(twinkles[i].x, twinkles[i].y, col);
  }
}

void drawRubberDuck(int cx, int cy) {
  matrix.fillEllipse(cx, cy + 4, 10, 6, COL_YELLOW);
  matrix.fillCircle(cx - 9, cy + 3, 3, COL_YELLOW);

  matrix.fillEllipse(cx - 2, cy + 4, 5, 3, COL_DUCK_DARK);
  matrix.drawEllipse(cx - 2, cy + 4, 5, 3, COL_BLACK);
  matrix.fillEllipse(cx - 2, cy + 4, 3, 2, COL_YELLOW);

  matrix.fillRect(cx + 2, cy, 4, 5, COL_YELLOW);
  matrix.fillCircle(cx + 4, cy - 3, 5, COL_YELLOW);

  matrix.drawPixel(cx + 6, cy - 5, COL_WHITE);
  matrix.drawPixel(cx + 7, cy - 5, COL_BLACK);

  matrix.fillTriangle(cx + 7, cy - 3, cx + 14, cy - 2, cx + 7, cy - 1, COL_DUCK_BEAK);
  matrix.fillTriangle(cx + 7, cy - 1, cx + 13, cy,     cx + 7, cy + 1, COL_DUCK_BEAK);
  matrix.drawFastHLine(cx + 7, cy - 1, 6, COL_DUCK_DARK);
}

void drawCleaningScreen(unsigned long now) {
  if (!twinkleInit) initTwinkles();

  static unsigned long lastTwinkleTick = 0;
  if (now - lastTwinkleTick >= 120) {
    lastTwinkleTick = now;
    tickTwinkles();
  }

  matrix.fillRect(0, 0, matrix.width(), 9, COL_GREY);
  matrix.setTextSize(1);
  matrix.setTextColor(COL_BLACK);
  const char* title = "CLEANING";
  matrix.setCursor((matrix.width() - (int)strlen(title) * 6) / 2, 1);
  matrix.print(title);

  drawTwinkles();
  drawRubberDuck(matrix.width() / 2 + 1, 32);

  if (now - lastScrollTime >= (unsigned long)scrollInterval) {
    lastScrollTime = now;
    scrollX--;
    const char* hint = "Long press to return";
    if (scrollX < -(int)(strlen(hint) * 6)) scrollX = matrix.width();
  }
  matrix.setTextSize(1);
  matrix.setTextColor(COL_BROWN);
  matrix.setCursor(scrollX, 56);
  matrix.print("Long press to return");

  if (longHeld) {
    unsigned long held = now - longHeldStart;
    int barW = (int)((held * (matrix.width() - 4)) / 3000);
    if (barW > matrix.width() - 4) barW = matrix.width() - 4;
    matrix.drawRect(2, 44, matrix.width() - 4, 5, COL_BAR_BG);
    matrix.fillRect(2, 44, barW, 5, COL_CYAN);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Setup & Loop
// ═══════════════════════════════════════════════════════════════════════════════

void setup() {
  Serial.begin(115200);

  pinMode(BTN_UP,   INPUT_PULLUP);
  pinMode(BTN_DOWN, INPUT_PULLUP);

  pinMode(4, OUTPUT);
  digitalWrite(4, LOW);

  ProtomatterStatus status = matrix.begin();
  Serial.print("Protomatter status: ");
  Serial.println((int)status);
  // 0 = OK, 1 = pin error, 2 = malloc error, 3 = other
  if (status != PROTOMATTER_OK) {
    Serial.println("Matrix init FAILED — halting");
    for (;;);
  }
  Serial.println("Matrix init OK");
  matrix.setTextWrap(false);
  matrix.setRotation(1);

  // Compute all colors once
  COL_WHITE     = 0xFFFF;
  COL_BLACK     = 0x0000;
  COL_TEMP      = matrix.color565(255, 140,  40);
  COL_HUM       = matrix.color565( 80, 180, 255);
  COL_DIM_WHITE = matrix.color565( 80,  80,  80);
  COL_YELLOW    = matrix.color565(255, 210,   0);
  COL_CYAN      = matrix.color565( 80, 220, 255);
  COL_GREY      = matrix.color565( 64,  64,  64);
  COL_BROWN     = matrix.color565(120,  79,  23);
  COL_DUCK_DARK = matrix.color565(180, 140,   0);
  COL_DUCK_BEAK = matrix.color565(255,  80,   0);
  COL_BAR_BG    = matrix.color565( 60,  60,  60);
  COL_ICON_GRAY = matrix.color565(100, 100, 100);
  COL_ICON_RED  = matrix.color565(220,  40,  40);
  COL_ICON_GOLD = matrix.color565(200, 160,  40);
  COL_WS_SPIN   = matrix.color565(180,  80, 255); 

  xTaskCreatePinnedToCore(sensorTask,  "SensorTask",  4096, NULL, 1, NULL, 0);
  xTaskCreatePinnedToCore(networkTask, "NetworkTask", 8192, NULL, 1, NULL, 0);
}

void loop() {
  unsigned long now = millis();

  bool upState    = digitalRead(BTN_UP);
  bool downState  = digitalRead(BTN_DOWN);
  bool eitherHeld = (upState == LOW || downState == LOW);

  // --- Long press ---
  if (eitherHeld) {
    if (!longHeld) {
      longHeld      = true;
      longHeldStart = now;
    } else if (now - longHeldStart >= 3000) {
      longHeld          = false;
      waitingForRelease = true;

      if (appState == STATE_COUNTER) {
        appState        = STATE_CLEANING;
        scrollX         = matrix.width();
        wsCleaningState = true;
        wsDataDirty     = true;
      } else {
        appState        = STATE_COUNTER;
        counter         = 0;
        twinkleInit     = false;
        triggerRipple(true);
        wsCounter       = 0;
        wsCleaningState = false;
        wsDataDirty     = true;
      }
    }
  } else {
    longHeld          = false;
    waitingForRelease = false;
  }

  bool longPressEngaged = longHeld && (now - longHeldStart > 300);

  // --- Counter buttons ---
if (lastUpState == HIGH && upState == LOW) {
      counter++;
      triggerRipple(true);
      triggerCircleAnim();
      wsCounter   = counter;
      wsDataDirty = true;
    }
    if (lastDownState == HIGH && downState == LOW && counter > 0) {
      counter--;
      triggerRipple(false);
      triggerCircleAnim();
      wsCounter   = counter;
      wsDataDirty = true;
    }

  lastUpState   = upState;
  lastDownState = downState;

  if (sensorReady) {
    lastTemp = sharedTemp;
    lastHum  = sharedHum;
  }

  // --- Ripple tick ---
  if (rippleActive && now - lastRippleTime >= (unsigned long)rippleInterval) {
    lastRippleTime = now;
    rippleFrame++;
    if (rippleFrame > (2 * rippleRingGap) + (rippleMaxR - rippleStartR)) {
      rippleActive = false;
    }
  }

// --- Circle anim tick ---
  if (circleAnimActive && now - lastCircleTime >= (unsigned long)circleAnimInterval) {
    lastCircleTime = now;
    circleAnimFrame++;
    if (circleAnimFrame >= 17) circleAnimActive = false;
  }

  // --- Draw ---
  matrix.fillScreen(COL_BLACK);

  if (appState == STATE_COUNTER) {
    drawCounter(counter);
    drawSensors(lastTemp, lastHum);
    if (rippleActive) drawRippleFrame();
  } else {
    drawCleaningScreen(now);
  }

  drawStatusIcons(now);
  matrix.show();
  delay(5);
}