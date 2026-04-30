/**
 * DernDee IMU Node - Medical Grade V2 (Raw Data 100Hz)
 * Specification:
 * - Rate: 100Hz (10ms interval)
 * - Data: Raw Int16 (No scaling)
 * - Packet: [Header(2), ax, ay, az, gx, gy, gz, Timestamp(4), Checksum(1)]
 */

#include <Wire.h>

#include <BLE2902.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>

// ========== 1. Configuration ==========
// ⚠️ Set Name: "DernDee_Chest", "DernDee_L_Thigh", "DernDee_R_Thigh",
// "DernDee_L_Shank", "DernDee_R_Shank"
const char *SENSOR_ID = "DernDee_Chest";

#define SERVICE_UUID "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
#define CHARACTERISTIC_UUID "beb5483e-36e1-4688-b7f5-ea07361b26a8"

const int IMU_INTERVAL_MS = 10; // 100Hz (10ms)
const int LED_PIN = 2;

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
  uint16_t header;    // 0xAAAA
  int16_t gx, gy, gz; // Raw Gyro
  int16_t ax, ay, az; // Raw Accel
  uint32_t timestamp; // Millis
  uint8_t checksum;   // XOR Sum of all bytes
} PacketIMU;

// Global Variables
PacketIMU g_packet;
volatile bool g_packetReady = false;
int16_t ax_raw, ay_raw, az_raw, gx_raw, gy_raw, gz_raw;

// RTOS Handles
TaskHandle_t imuTaskHandle = nullptr;
TaskHandle_t bleTaskHandle = nullptr;
BLECharacteristic *pImuChar = nullptr;
BLEServer *pServer = nullptr;
portMUX_TYPE packetMux = portMUX_INITIALIZER_UNLOCKED;

// Connection State
bool deviceConnected = false;
bool oldDeviceConnected = false;

// Prototypes
void writeMPU(uint8_t reg, uint8_t data);
void readMPU();
void imuTask(void *pvParameters);
void bleTask(void *pvParameters);

// BLE Callbacks
class MyServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer *pServer) {
    deviceConnected = true;
    Serial.println("📱 Client Connected!");
    digitalWrite(LED_PIN, HIGH);
  };

  void onDisconnect(BLEServer *pServer) {
    deviceConnected = false;
    Serial.println("❌ Client Disconnected");
    digitalWrite(LED_PIN, LOW);
  }
};

// ========== 4. Setup ==========
void setup() {
  Serial.begin(115200);
  Wire.begin();
  pinMode(LED_PIN, OUTPUT);

  delay(500);
  Serial.println("--------------------------------");
  Serial.printf("Device: %s (V2 Medical Grade)\n", SENSOR_ID);

  // --- Init MPU9250 ---
  Wire.beginTransmission(MPU9250_ADDR);
  Wire.write(WHO_AM_I);
  Wire.endTransmission(false);
  Wire.requestFrom(MPU9250_ADDR, 1);
  uint8_t whoami = Wire.read();

  if (whoami != 0x71 && whoami != 0x73 && whoami != 0x70) {
    Serial.printf("⚠️ MPU9250 Not Found! (WHO_AM_I: 0x%02X)\n", whoami);
  }

  writeMPU(PWR_MGMT_1, 0x00);
  delay(100);
  // === GAIT ANALYSIS OPTIMIZED SETTINGS ===
  // Gyro: +/- 2000 dps (0x18) - Swing phase can reach 400-600 dps
  // Scale factor: 16.4 LSB/dps
  writeMPU(GYRO_CONFIG, 0x18); // +/- 2000 dps (prevents saturation)

  // Accel: +/- 8g (0x10) - Heel strike can reach 3-6g
  // Scale factor: 4096 LSB/g
  writeMPU(ACCEL_CONFIG, 0x10); // +/- 8g (prevents saturation)

  writeMPU(CONFIG, 0x03); // LPF ~41Hz

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

  // --- Advertising ---
  BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(SERVICE_UUID);
  pAdvertising->setScanResponse(true);
  pAdvertising->setMinPreferred(0x06);
  pAdvertising->setMaxPreferred(0x12);

  BLEDevice::startAdvertising();
  Serial.println("📡 BLE Advertising Started");

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
    Serial.println("📡 Restart advertising...");
    oldDeviceConnected = deviceConnected;
  }

  if (deviceConnected && !oldDeviceConnected) {
    oldDeviceConnected = deviceConnected;
  }
  vTaskDelay(100);
}

// ========== 5. Tasks Logic ==========

void imuTask(void *pvParameters) {
  for (;;) {
    readMPU();

    portENTER_CRITICAL(&packetMux);

    g_packet.header = 0xAA55; // Header
    g_packet.ax = ax_raw;
    g_packet.ay = ay_raw;
    g_packet.az = az_raw;
    g_packet.gx = gx_raw;
    g_packet.gy = gy_raw;
    g_packet.gz = gz_raw;
    g_packet.timestamp = millis();

    // Checksum Calculation (XOR of all bytes except checksum itself)
    uint8_t *ptr = (uint8_t *)&g_packet;
    uint8_t csum = 0;
    for (size_t i = 0; i < sizeof(PacketIMU) - 1; i++) {
      csum ^= ptr[i];
    }
    g_packet.checksum = csum;

    g_packetReady = true;
    portEXIT_CRITICAL(&packetMux);

    if (bleTaskHandle != nullptr)
      xTaskNotifyGive(bleTaskHandle);

    vTaskDelay(pdMS_TO_TICKS(IMU_INTERVAL_MS));
  }
}

void bleTask(void *pvParameters) {
  for (;;) {
    ulTaskNotifyTake(pdTRUE, portMAX_DELAY);

    if (deviceConnected) {
      PacketIMU txPacket;
      bool send = false;

      portENTER_CRITICAL(&packetMux);
      if (g_packetReady) {
        txPacket = g_packet;
        g_packetReady = false;
        send = true;
      }
      portEXIT_CRITICAL(&packetMux);

      if (send) {
        pImuChar->setValue((uint8_t *)&txPacket, sizeof(PacketIMU));
        pImuChar->notify();
      }
    }
  }
}

void writeMPU(uint8_t reg, uint8_t data) {
  Wire.beginTransmission(MPU9250_ADDR);
  Wire.write(reg);
  Wire.write(data);
  Wire.endTransmission(true);
}

void readMPU() {
  Wire.beginTransmission(MPU9250_ADDR);
  Wire.write(ACCEL_XOUT_H);
  Wire.endTransmission(false);
  Wire.requestFrom(MPU9250_ADDR, 14, true);

  if (Wire.available() == 14) {
    ax_raw = Wire.read() << 8 | Wire.read();
    ay_raw = Wire.read() << 8 | Wire.read();
    az_raw = Wire.read() << 8 | Wire.read();
    Wire.read();
    Wire.read(); // Temperature
    gx_raw = Wire.read() << 8 | Wire.read();
    gy_raw = Wire.read() << 8 | Wire.read();
    gz_raw = Wire.read() << 8 | Wire.read();
  }
}