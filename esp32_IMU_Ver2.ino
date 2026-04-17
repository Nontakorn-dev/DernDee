/**
 * DernDee Foot IMU Node - Packet V1
 *
 * Stream format (little-endian, packed, 22 bytes):
 * [magic(2), version(1), seq(2), timestamp_us(4),
 *  ax(2), ay(2), az(2), gx(2), gy(2), gz(2), crc8(1)]
 *
 * Sampling:
 * - MPU9250 accel/gyro raw int16
 * - 100 Hz via vTaskDelayUntil()
 * - BLE notifications with a small ring buffer between producer/consumer tasks
 */

#include <Wire.h>

#include <BLE2902.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>

// ========== 1. Configuration ==========
// Change device name per foot before flashing: "DernDee_L_Foot", "DernDee_R_Foot"
const char *SENSOR_ID = "DernDee_R_Foot";

#define SERVICE_UUID "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
#define CHARACTERISTIC_UUID "beb5483e-36e1-4688-b7f5-ea07361b26a8"

const int IMU_INTERVAL_MS = 10; // 100 Hz
const int LED_PIN = 2;
const uint16_t IMU_PACKET_MAGIC = 0xAA55;
const uint8_t IMU_PACKET_VERSION = 1;
const uint8_t IMU_RING_BUFFER_CAPACITY = 12;
const uint32_t DIAG_INTERVAL_MS = 1000;

// ========== 2. MPU9250 Register Map ==========
#define MPU9250_ADDR 0x68
#define PWR_MGMT_1 0x6B
#define ACCEL_XOUT_H 0x3B
#define WHO_AM_I 0x75
#define CONFIG 0x1A
#define GYRO_CONFIG 0x1B
#define ACCEL_CONFIG 0x1C

// ========== 3. Data Structures ==========
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

// Ring Buffer
ImuPacketV1 g_packetBuffer[IMU_RING_BUFFER_CAPACITY];
volatile uint8_t g_packetHead = 0;
volatile uint8_t g_packetTail = 0;
volatile uint8_t g_packetCount = 0;

// Diagnostics / Shared State
volatile uint16_t g_nextSeq = 0;
volatile uint32_t g_readErrorCount = 0;
volatile uint32_t g_droppedSampleCount = 0;
volatile uint32_t g_sentPacketCount = 0;
volatile uint32_t g_lastDiagMs = 0;

// RTOS Handles
TaskHandle_t imuTaskHandle = nullptr;
TaskHandle_t bleTaskHandle = nullptr;
BLECharacteristic *pImuChar = nullptr;
BLEServer *pServer = nullptr;
portMUX_TYPE packetMux = portMUX_INITIALIZER_UNLOCKED;

// Connection State
volatile bool deviceConnected = false;
bool oldDeviceConnected = false;

// Prototypes
void writeMPU(uint8_t reg, uint8_t data);
bool readMPU(ImuRawSample &sample);
void imuTask(void *pvParameters);
void bleTask(void *pvParameters);
bool pushPacket(const ImuPacketV1 &packet);
bool popPacket(ImuPacketV1 &packet);
uint8_t calcCRC8(const uint8_t *data, size_t len);
void logDiagnosticsIfDue();

// BLE Callbacks
class MyServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer *server) {
    (void)server;
    deviceConnected = true;
    Serial.println("Client connected");
    digitalWrite(LED_PIN, HIGH);
  };

  void onDisconnect(BLEServer *server) {
    (void)server;
    deviceConnected = false;
    Serial.println("Client disconnected");
    digitalWrite(LED_PIN, LOW);
  }
};

// ========== 4. Setup ==========
void setup() {
  Serial.begin(115200);
  Wire.begin();
  Wire.setClock(400000);
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);

  delay(500);
  Serial.println("--------------------------------");
  Serial.printf("Device: %s (Foot IMU Packet V1)\n", SENSOR_ID);
  Serial.printf("Packet size: %u bytes, Ring buffer: %u packets\n",
                static_cast<unsigned int>(sizeof(ImuPacketV1)),
                static_cast<unsigned int>(IMU_RING_BUFFER_CAPACITY));

  // --- Init MPU9250 ---
  Wire.beginTransmission(MPU9250_ADDR);
  Wire.write(WHO_AM_I);
  Wire.endTransmission(false);
  uint8_t bytesRead = Wire.requestFrom(MPU9250_ADDR, 1, true);
  uint8_t whoami = bytesRead == 1 ? Wire.read() : 0x00;

  if (whoami != 0x71 && whoami != 0x73 && whoami != 0x70) {
    Serial.printf("Warning: MPU9250 not found (WHO_AM_I: 0x%02X)\n", whoami);
  } else {
    Serial.printf("MPU WHO_AM_I: 0x%02X\n", whoami);
  }

  writeMPU(PWR_MGMT_1, 0x00);
  delay(100);

  // Foot-mounted gait settings:
  // Gyro: +/- 2000 dps to avoid saturation during swing.
  // Accel: +/- 8g to preserve heel-strike transients.
  writeMPU(GYRO_CONFIG, 0x18);  // +/- 2000 dps
  writeMPU(ACCEL_CONFIG, 0x10); // +/- 8g
  writeMPU(CONFIG, 0x03);       // LPF ~41 Hz

  // --- Init BLE ---
  BLEDevice::init(SENSOR_ID);
  BLEDevice::setMTU(64);

  pServer = BLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks());

  BLEService *pService = pServer->createService(SERVICE_UUID);
  pImuChar = pService->createCharacteristic(CHARACTERISTIC_UUID,
                                            BLECharacteristic::PROPERTY_NOTIFY);
  pImuChar->addDescriptor(new BLE2902());
  pService->start();

  BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(SERVICE_UUID);
  pAdvertising->setScanResponse(true);
  pAdvertising->setMinPreferred(0x06);
  pAdvertising->setMaxPreferred(0x12);

  BLEDevice::startAdvertising();
  Serial.println("BLE advertising started");

  // --- Tasks ---
  xTaskCreatePinnedToCore(imuTask, "imuTask", 4096, nullptr, 2, &imuTaskHandle,
                          1);
  xTaskCreatePinnedToCore(bleTask, "bleTask", 4096, nullptr, 1, &bleTaskHandle,
                          0);
}

void loop() {
  if (!deviceConnected && oldDeviceConnected) {
    delay(500);
    pServer->startAdvertising();
    Serial.println("Restart advertising");
    oldDeviceConnected = deviceConnected;
  }

  if (deviceConnected && !oldDeviceConnected) {
    oldDeviceConnected = deviceConnected;
  }

  logDiagnosticsIfDue();
  vTaskDelay(pdMS_TO_TICKS(100));
}

// ========== 5. Tasks Logic ==========

void imuTask(void *pvParameters) {
  (void)pvParameters;
  TickType_t lastWakeTime = xTaskGetTickCount();

  for (;;) {
    ImuRawSample raw;
    if (readMPU(raw)) {
      ImuPacketV1 packet;
      packet.magic = IMU_PACKET_MAGIC;
      packet.version = IMU_PACKET_VERSION;

      portENTER_CRITICAL(&packetMux);
      packet.seq = g_nextSeq++;
      portEXIT_CRITICAL(&packetMux);

      packet.timestamp_us = static_cast<uint32_t>(micros());
      packet.ax = raw.ax;
      packet.ay = raw.ay;
      packet.az = raw.az;
      packet.gx = raw.gx;
      packet.gy = raw.gy;
      packet.gz = raw.gz;
      packet.crc8 = calcCRC8(reinterpret_cast<const uint8_t *>(&packet),
                             sizeof(ImuPacketV1) - 1);

      pushPacket(packet);

      if (bleTaskHandle != nullptr) {
        xTaskNotifyGive(bleTaskHandle);
      }
    } else {
      portENTER_CRITICAL(&packetMux);
      g_readErrorCount++;
      portEXIT_CRITICAL(&packetMux);
    }

    vTaskDelayUntil(&lastWakeTime, pdMS_TO_TICKS(IMU_INTERVAL_MS));
  }
}

void bleTask(void *pvParameters) {
  (void)pvParameters;

  for (;;) {
    ulTaskNotifyTake(pdTRUE, portMAX_DELAY);

    ImuPacketV1 txPacket;
    while (popPacket(txPacket)) {
      if (deviceConnected && pImuChar != nullptr) {
        pImuChar->setValue(reinterpret_cast<uint8_t *>(&txPacket),
                           sizeof(ImuPacketV1));
        pImuChar->notify();

        portENTER_CRITICAL(&packetMux);
        g_sentPacketCount++;
        portEXIT_CRITICAL(&packetMux);
      }
    }
  }
}

// ========== 6. I2C / Buffer Utilities ==========

void writeMPU(uint8_t reg, uint8_t data) {
  Wire.beginTransmission(MPU9250_ADDR);
  Wire.write(reg);
  Wire.write(data);
  Wire.endTransmission(true);
}

bool readMPU(ImuRawSample &sample) {
  Wire.beginTransmission(MPU9250_ADDR);
  Wire.write(ACCEL_XOUT_H);
  if (Wire.endTransmission(false) != 0) {
    return false;
  }

  uint8_t count = Wire.requestFrom(MPU9250_ADDR, 14, true);
  if (count != 14 || Wire.available() != 14) {
    while (Wire.available()) {
      Wire.read();
    }
    return false;
  }

  sample.ax = static_cast<int16_t>(Wire.read() << 8 | Wire.read());
  sample.ay = static_cast<int16_t>(Wire.read() << 8 | Wire.read());
  sample.az = static_cast<int16_t>(Wire.read() << 8 | Wire.read());
  Wire.read();
  Wire.read(); // Temperature
  sample.gx = static_cast<int16_t>(Wire.read() << 8 | Wire.read());
  sample.gy = static_cast<int16_t>(Wire.read() << 8 | Wire.read());
  sample.gz = static_cast<int16_t>(Wire.read() << 8 | Wire.read());
  return true;
}

bool pushPacket(const ImuPacketV1 &packet) {
  bool droppedOldest = false;

  portENTER_CRITICAL(&packetMux);

  if (g_packetCount == IMU_RING_BUFFER_CAPACITY) {
    g_packetTail = (g_packetTail + 1) % IMU_RING_BUFFER_CAPACITY;
    g_packetCount--;
    g_droppedSampleCount++;
    droppedOldest = true;
  }

  g_packetBuffer[g_packetHead] = packet;
  g_packetHead = (g_packetHead + 1) % IMU_RING_BUFFER_CAPACITY;
  g_packetCount++;

  portEXIT_CRITICAL(&packetMux);
  return !droppedOldest;
}

bool popPacket(ImuPacketV1 &packet) {
  bool hasPacket = false;

  portENTER_CRITICAL(&packetMux);
  if (g_packetCount > 0) {
    packet = g_packetBuffer[g_packetTail];
    g_packetTail = (g_packetTail + 1) % IMU_RING_BUFFER_CAPACITY;
    g_packetCount--;
    hasPacket = true;
  }
  portEXIT_CRITICAL(&packetMux);

  return hasPacket;
}

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
  uint32_t nowMs = millis();
  uint32_t lastDiagMs = 0;

  portENTER_CRITICAL(&packetMux);
  lastDiagMs = g_lastDiagMs;
  portEXIT_CRITICAL(&packetMux);

  if (nowMs - lastDiagMs < DIAG_INTERVAL_MS) {
    return;
  }

  uint32_t readErrors = 0;
  uint32_t droppedSamples = 0;
  uint32_t sentPackets = 0;
  uint8_t queuedPackets = 0;
  uint16_t nextSeq = 0;

  portENTER_CRITICAL(&packetMux);
  g_lastDiagMs = nowMs;
  readErrors = g_readErrorCount;
  droppedSamples = g_droppedSampleCount;
  sentPackets = g_sentPacketCount;
  queuedPackets = g_packetCount;
  nextSeq = g_nextSeq;
  portEXIT_CRITICAL(&packetMux);

  Serial.printf(
      "diag connected=%u seq=%u sent=%lu queued=%u read_err=%lu dropped=%lu\n",
      deviceConnected ? 1 : 0, nextSeq, static_cast<unsigned long>(sentPackets),
      static_cast<unsigned int>(queuedPackets),
      static_cast<unsigned long>(readErrors),
      static_cast<unsigned long>(droppedSamples));
}
