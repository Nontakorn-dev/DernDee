/**
 * DernDee Foot IMU Node - BLE Mock Packet V1
 *
 * Purpose:
 * - Test BLE connectivity to gateway_v2 without a real IMU sensor
 * - Preserve the same BLE UUIDs and Packet V1 format as production firmware
 * - Stream plausible synthetic accel/gyro raw values at 100 Hz
 */

#include <math.h>

#include <BLE2902.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>

// ========== 1. Configuration ==========
// Change device name per foot before flashing: "DernDee_L_Foot", "DernDee_R_Foot"
const char *SENSOR_ID = "DernDee_R_Foot";

#define SERVICE_UUID "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
#define CHARACTERISTIC_UUID "beb5483e-36e1-4688-b7f5-ea07361b26a8"

const int LED_PIN = 2;
const uint16_t IMU_PACKET_MAGIC = 0xAA55;
const uint8_t IMU_PACKET_VERSION = 1;
const uint32_t PACKET_INTERVAL_US = 10000; // 100 Hz
const uint32_t DIAG_INTERVAL_MS = 1000;

// Synthetic gait profile tuned for +/-8g accel and +/-2000 dps gyro scaling.
const float STEP_FREQUENCY_HZ = 1.8f;
const float ACCEL_LSB_PER_G = 4096.0f;
const float GYRO_LSB_PER_DPS = 16.4f;

// ========== 2. Data Structures ==========
typedef struct __attribute__((packed)) {
  uint16_t magic;
  uint8_t version;
  uint16_t seq;
  uint32_t timestamp_us;
  int16_t ax;
  int16_t ay;
  int16_t az;
  int16_t gx;
  int16_t gy;
  int16_t gz;
  uint8_t crc8;
} ImuPacketV1;

typedef struct {
  int16_t ax;
  int16_t ay;
  int16_t az;
  int16_t gx;
  int16_t gy;
  int16_t gz;
} ImuRawSample;

static_assert(sizeof(ImuPacketV1) == 22, "ImuPacketV1 must be 22 bytes");

// ========== 3. Runtime State ==========
BLECharacteristic *pImuChar = nullptr;
BLEServer *pServer = nullptr;
portMUX_TYPE statsMux = portMUX_INITIALIZER_UNLOCKED;

volatile bool deviceConnected = false;
bool oldDeviceConnected = false;

volatile uint16_t g_nextSeq = 0;
volatile uint32_t g_sentPacketCount = 0;
volatile uint32_t g_connectCount = 0;
volatile uint32_t g_disconnectCount = 0;
volatile uint32_t g_lastDiagMs = 0;

uint32_t g_streamStartUs = 0;
uint32_t g_nextPacketUs = 0;

// Prototypes
void generateMockSample(uint32_t timestampUs, ImuRawSample &sample);
void sendMockPacket(uint32_t timestampUs);
uint8_t calcCRC8(const uint8_t *data, size_t len);
void logDiagnosticsIfDue();

// BLE Callbacks
class MyServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer *server) {
    (void)server;
    deviceConnected = true;
    portENTER_CRITICAL(&statsMux);
    g_connectCount++;
    portEXIT_CRITICAL(&statsMux);
    Serial.println("Client connected");
    digitalWrite(LED_PIN, HIGH);
  };

  void onDisconnect(BLEServer *server) {
    (void)server;
    deviceConnected = false;
    portENTER_CRITICAL(&statsMux);
    g_disconnectCount++;
    portEXIT_CRITICAL(&statsMux);
    Serial.println("Client disconnected");
    digitalWrite(LED_PIN, LOW);
  }
};

// ========== 4. Setup ==========
void setup() {
  Serial.begin(115200);
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);

  delay(500);
  Serial.println("--------------------------------");
  Serial.printf("Device: %s (BLE Mock IMU Packet V1)\n", SENSOR_ID);
  Serial.printf("Packet size: %u bytes, Rate: %lu Hz\n",
                static_cast<unsigned int>(sizeof(ImuPacketV1)),
                static_cast<unsigned long>(1000000UL / PACKET_INTERVAL_US));

  Serial.println("BLE step 1: BLEDevice::init");
  BLEDevice::init(SENSOR_ID);
  Serial.println("BLE step 1 ok");

  Serial.println("BLE step 2: createServer");
  pServer = BLEDevice::createServer();
  Serial.println("BLE step 2 ok");
  pServer->setCallbacks(new MyServerCallbacks());

  Serial.println("BLE step 3: createService");
  BLEService *pService = pServer->createService(SERVICE_UUID);
  Serial.println("BLE step 3 ok");

  Serial.println("BLE step 4: createCharacteristic");
  pImuChar = pService->createCharacteristic(CHARACTERISTIC_UUID,
                                            BLECharacteristic::PROPERTY_NOTIFY);
  Serial.println("BLE step 4 ok");

  Serial.println("BLE step 5: addDescriptor");
  pImuChar->addDescriptor(new BLE2902());
  Serial.println("BLE step 5 ok");

  Serial.println("BLE step 6: startService");
  pService->start();
  Serial.println("BLE step 6 ok");

  Serial.println("BLE step 7: getAdvertising");
  BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
  Serial.println("BLE step 7 ok");
  pAdvertising->addServiceUUID(SERVICE_UUID);
  pAdvertising->setScanResponse(true);

  Serial.println("BLE step 8: startAdvertising");
  BLEDevice::startAdvertising();
  Serial.println("BLE step 8 ok");
  Serial.println("BLE advertising started");
}

void loop() {
  const uint32_t nowUs = micros();

  if (!deviceConnected && oldDeviceConnected) {
    delay(200);
    pServer->startAdvertising();
    Serial.println("Restart advertising");
    oldDeviceConnected = false;
    g_streamStartUs = 0;
    g_nextPacketUs = 0;
  }

  if (deviceConnected && !oldDeviceConnected) {
    oldDeviceConnected = true;
    g_streamStartUs = nowUs;
    g_nextPacketUs = nowUs;
  }

  while (deviceConnected && static_cast<int32_t>(nowUs - g_nextPacketUs) >= 0) {
    sendMockPacket(g_nextPacketUs);
    g_nextPacketUs += PACKET_INTERVAL_US;
  }

  logDiagnosticsIfDue();
  delay(1);
}

// ========== 5. Mock Signal Generation ==========

void generateMockSample(uint32_t timestampUs, ImuRawSample &sample) {
  const float timeSec = static_cast<float>(timestampUs - g_streamStartUs) / 1000000.0f;
  const float phase = 2.0f * PI * STEP_FREQUENCY_HZ * timeSec;
  const float harmonic = 2.0f * phase;

  // Synthetic walking-like waveform with gravity bias on Z.
  sample.ax = static_cast<int16_t>(320.0f * sinf(phase) + 90.0f * sinf(harmonic));
  sample.ay = static_cast<int16_t>(180.0f * cosf(phase));
  sample.az = static_cast<int16_t>(ACCEL_LSB_PER_G +
                                   700.0f * fabsf(sinf(phase)) +
                                   150.0f * sinf(harmonic));

  sample.gx = static_cast<int16_t>(GYRO_LSB_PER_DPS * (18.0f * cosf(phase)));
  sample.gy = static_cast<int16_t>(GYRO_LSB_PER_DPS * (55.0f * sinf(phase)));
  sample.gz = static_cast<int16_t>(GYRO_LSB_PER_DPS * (12.0f * sinf(harmonic)));
}

void sendMockPacket(uint32_t timestampUs) {
  if (pImuChar == nullptr) {
    return;
  }

  ImuRawSample raw;
  generateMockSample(timestampUs, raw);

  ImuPacketV1 packet;
  packet.magic = IMU_PACKET_MAGIC;
  packet.version = IMU_PACKET_VERSION;

  portENTER_CRITICAL(&statsMux);
  packet.seq = g_nextSeq++;
  portEXIT_CRITICAL(&statsMux);

  packet.timestamp_us = timestampUs;
  packet.ax = raw.ax;
  packet.ay = raw.ay;
  packet.az = raw.az;
  packet.gx = raw.gx;
  packet.gy = raw.gy;
  packet.gz = raw.gz;
  packet.crc8 = calcCRC8(reinterpret_cast<const uint8_t *>(&packet),
                         sizeof(ImuPacketV1) - 1);

  pImuChar->setValue(reinterpret_cast<uint8_t *>(&packet), sizeof(ImuPacketV1));
  pImuChar->notify();

  portENTER_CRITICAL(&statsMux);
  g_sentPacketCount++;
  portEXIT_CRITICAL(&statsMux);
}

// ========== 6. CRC / Diagnostics ==========

// CRC-8-ATM (poly 0x07, init 0x00)
uint8_t calcCRC8(const uint8_t *data, size_t len) {
  uint8_t crc = 0x00;

  for (size_t i = 0; i < len; i++) {
    crc ^= data[i];
    for (uint8_t bit = 0; bit < 8; bit++) {
      if ((crc & 0x80) != 0) {
        crc = static_cast<uint8_t>((crc << 1) ^ 0x07);
      } else {
        crc <<= 1;
      }
    }
  }

  return crc;
}

void logDiagnosticsIfDue() {
  const uint32_t nowMs = millis();
  uint32_t lastDiagMs = 0;

  portENTER_CRITICAL(&statsMux);
  lastDiagMs = g_lastDiagMs;
  portEXIT_CRITICAL(&statsMux);

  if (nowMs - lastDiagMs < DIAG_INTERVAL_MS) {
    return;
  }

  uint32_t sentPackets = 0;
  uint32_t connectCount = 0;
  uint32_t disconnectCount = 0;
  uint16_t nextSeq = 0;

  portENTER_CRITICAL(&statsMux);
  g_lastDiagMs = nowMs;
  sentPackets = g_sentPacketCount;
  connectCount = g_connectCount;
  disconnectCount = g_disconnectCount;
  nextSeq = g_nextSeq;
  portEXIT_CRITICAL(&statsMux);

  Serial.printf(
      "diag mock connected=%u seq=%u sent=%lu conn=%lu disc=%lu\n",
      deviceConnected ? 1 : 0,
      nextSeq,
      static_cast<unsigned long>(sentPackets),
      static_cast<unsigned long>(connectCount),
      static_cast<unsigned long>(disconnectCount));
}