#include <Arduino.h>
#include <ArduinoJson.h>
#include <cstring>

#include "EPD.h"
#include "usage_font.h"

// The CrowPanel routes USB-C through its CH340K bridge to UART0.
constexpr uint32_t SERIAL_BAUD = 115200;
constexpr size_t MAX_LINE_BYTES = 2048;
constexpr uint8_t DISPLAY_POWER_PIN = 7;
constexpr uint8_t POWER_LED_PIN = 19;
constexpr uint8_t PARTIAL_REFRESHES_BEFORE_FULL = 24;

extern uint8_t ImageBW[ALLSCREEN_BYTES];
uint8_t PreviousImageBW[ALLSCREEN_BYTES];
bool hasPreviousFrame = false;
uint8_t partialRefreshesSinceFull = 0;

struct DisplaySnapshot {
  const char *state;
  uint64_t generatedAt;
  uint8_t usedPercent;
  uint8_t remainingPercent;
  bool hasResetAt;
  uint64_t resetAt;
  const char *resetInLabel;
  const char *resetAtLabel;
  bool hasResetCredits;
  uint16_t resetCredits;
  const char *updatedAtLabel;
};

char serialLine[MAX_LINE_BYTES + 1];
size_t serialLineLength = 0;
bool discardingOversizeLine = false;

bool isExpectedKey(const char *key) {
  static const char *const keys[] = {
    "schemaVersion", "type", "state", "generatedAt", "usedPercent",
    "remainingPercent", "resetAt", "resetInLabel", "resetAtLabel",
    "resetCredits", "updatedAtLabel"
  };
  for (const char *expected : keys) {
    if (strcmp(key, expected) == 0) return true;
  }
  return false;
}

bool isSafeLabel(JsonVariantConst value, size_t maxBytes) {
  if (!value.is<const char *>()) return false;
  const char *text = value.as<const char *>();
  if (text == nullptr) return false;
  const size_t length = strlen(text);
  if (length == 0 || length > maxBytes) return false;
  for (size_t index = 0; index < length; ++index) {
    const uint8_t byte = static_cast<uint8_t>(text[index]);
    if (byte < 0x20 || byte == 0x7f) return false;
  }
  return true;
}

bool isUnsignedInteger(JsonVariantConst value, uint64_t maximum) {
  if (!value.is<uint64_t>()) return false;
  return value.as<uint64_t>() <= maximum;
}

bool decodeSnapshot(JsonDocument &document, DisplaySnapshot &snapshot) {
  if (!document.is<JsonObject>()) return false;
  JsonObjectConst object = document.as<JsonObjectConst>();
  if (object.size() != 11) return false;
  for (JsonPairConst pair : object) {
    if (!isExpectedKey(pair.key().c_str())) return false;
  }

  if (!object["schemaVersion"].is<uint8_t>() || object["schemaVersion"].as<uint8_t>() != 1) return false;
  if (!object["type"].is<const char *>() || strcmp(object["type"].as<const char *>(), "codex_usage") != 0) return false;
  if (!object["state"].is<const char *>()) return false;
  const char *state = object["state"].as<const char *>();
  if (strcmp(state, "live") != 0 && strcmp(state, "limited") != 0) return false;

  constexpr uint64_t MAX_SAFE_INTEGER = 9007199254740991ULL;
  if (!isUnsignedInteger(object["generatedAt"], MAX_SAFE_INTEGER)) return false;
  if (!isUnsignedInteger(object["usedPercent"], 100)) return false;
  if (!isUnsignedInteger(object["remainingPercent"], 100)) return false;

  const uint8_t usedPercent = object["usedPercent"].as<uint8_t>();
  const uint8_t remainingPercent = object["remainingPercent"].as<uint8_t>();
  if (static_cast<uint16_t>(usedPercent) + remainingPercent != 100) return false;

  const bool hasResetAt = !object["resetAt"].isNull();
  if (hasResetAt && !isUnsignedInteger(object["resetAt"], MAX_SAFE_INTEGER)) return false;
  const bool hasResetCredits = !object["resetCredits"].isNull();
  if (hasResetCredits && !isUnsignedInteger(object["resetCredits"], 999)) return false;

  if (!isSafeLabel(object["resetInLabel"], 16)) return false;
  // The host's middle-dot separator is UTF-8, so byte bounds are slightly wider
  // than the protocol's JavaScript character bounds.
  if (!isSafeLabel(object["resetAtLabel"], 32)) return false;
  if (!isSafeLabel(object["updatedAtLabel"], 16)) return false;

  snapshot = {
    state,
    object["generatedAt"].as<uint64_t>(),
    usedPercent,
    remainingPercent,
    hasResetAt,
    hasResetAt ? object["resetAt"].as<uint64_t>() : 0,
    object["resetInLabel"].as<const char *>(),
    object["resetAtLabel"].as<const char *>(),
    hasResetCredits,
    static_cast<uint16_t>(hasResetCredits ? object["resetCredits"].as<uint16_t>() : 0),
    object["updatedAtLabel"].as<const char *>()
  };
  return true;
}

void copyDisplayAscii(char *destination, size_t capacity, const char *source) {
  if (capacity == 0) return;
  size_t output = 0;
  for (size_t input = 0; source[input] != '\0' && output + 1 < capacity; ++input) {
    const uint8_t byte = static_cast<uint8_t>(source[input]);
    // Normalize the host's UTF-8 middle dot to an ordinary space. The bundled
    // Elecrow bitmap font contains printable ASCII only.
    if (byte == 0xC2 && static_cast<uint8_t>(source[input + 1]) == 0xB7) {
      destination[output++] = ' ';
      ++input;
    } else if (byte >= 0x20 && byte <= 0x7E) {
      destination[output++] = static_cast<char>(byte);
    } else {
      destination[output++] = '?';
      while ((static_cast<uint8_t>(source[input + 1]) & 0xC0) == 0x80) ++input;
    }
  }
  destination[output] = '\0';
}

void truncateAscii(char *text, size_t maximumCharacters) {
  if (strlen(text) > maximumCharacters) text[maximumCharacters] = '\0';
}

void fillRectangle(uint16_t left, uint16_t top, uint16_t right, uint16_t bottom, uint8_t color) {
  for (uint16_t y = top; y <= bottom; ++y) {
    EPD_DrawLine(left, y, right, y, color);
  }
}

int8_t usageGlyphIndex(char character) {
  if (character >= '0' && character <= '9') return character - '0';
  if (character == '%') return 10;
  return -1;
}

uint16_t measureUsageText(const char *text) {
  uint16_t width = 0;
  for (size_t index = 0; text[index] != '\0'; ++index) {
    const int8_t glyphIndex = usageGlyphIndex(text[index]);
    if (glyphIndex >= 0) width += usage_glyphs[glyphIndex].width;
  }
  return width;
}

void drawUsageText(const char *text, uint16_t top) {
  const uint16_t totalWidth = measureUsageText(text);
  if (totalWidth == 0 || totalWidth > 119) return;

  const uint16_t left = (119 - totalWidth) / 2;
  uint16_t visualOffset = 0;
  for (size_t characterIndex = 0; text[characterIndex] != '\0'; ++characterIndex) {
    const int8_t glyphIndex = usageGlyphIndex(text[characterIndex]);
    if (glyphIndex < 0) continue;
    const UsageGlyph &glyph = usage_glyphs[glyphIndex];
    for (uint8_t y = 0; y < glyph.height; ++y) {
      for (uint8_t x = 0; x < glyph.width; ++x) {
        const uint16_t byteIndex = static_cast<uint16_t>(y) * glyph.bytesPerRow + x / 8;
        if ((glyph.bitmap[byteIndex] & (0x80 >> (x % 8))) == 0) continue;

        // Orientation 2 mirrors logical X on the physical panel. Reverse the
        // composed line here so the custom proportional font reads normally.
        const uint16_t logicalX = left + totalWidth - 1 - (visualOffset + x);
        EPD_DrawPoint(logicalX, top + y, WHITE);
      }
    }
    visualOffset += glyph.width;
  }
}

void drawCredits(const DisplaySnapshot &snapshot) {
  char credits[6];
  if (snapshot.hasResetCredits) snprintf(credits, sizeof(credits), "%u", snapshot.resetCredits);
  else strcpy(credits, "-");

  const size_t length = strlen(credits);
  const uint16_t size = length == 1 ? 32 : (length == 2 ? 24 : 16);
  const uint16_t width = length * (size / 2);
  EPD_ShowString(241 - width, 89, credits, BLACK, size);
}

void renderSnapshot(const DisplaySnapshot &snapshot) {
  // The SSD1680 image RAM uses 1 for white and 0 for black. Elecrow's text
  // helper handles that inversion internally; its primitive helper does not.
  memset(ImageBW, 0xFF, ALLSCREEN_BYTES);

  fillRectangle(0, 0, 249, 17, WHITE);
  const char *header = strcmp(snapshot.state, "limited") == 0 ? "LIMITED" : "CODEX / WEEK";
  EPD_ShowString(8, 3, header, WHITE, 12);

  char remaining[6];
  snprintf(remaining, sizeof(remaining), "%u%%", snapshot.remainingPercent);
  drawUsageText(remaining, 29);
  EPD_ShowString(9, 74, "REMAINING", BLACK, 12);

  EPD_DrawRectangle(9, 87, 108, 96, WHITE);
  EPD_DrawRectangle(10, 88, 107, 95, WHITE);
  const uint16_t barPixels = static_cast<uint16_t>((94UL * snapshot.remainingPercent + 50) / 100);
  if (barPixels > 0) fillRectangle(12, 90, 11 + barPixels, 93, WHITE);
  EPD_DrawLine(59, 88, 59, 95, WHITE);
  EPD_DrawLine(83, 88, 83, 95, WHITE);

  char refreshed[20];
  copyDisplayAscii(refreshed, sizeof(refreshed), snapshot.updatedAtLabel);
  truncateAscii(refreshed, 17);
  EPD_ShowString(9, 98, "LAST REFRESH", BLACK, 12);
  EPD_ShowString(9, 110, refreshed, BLACK, 12);

  EPD_DrawLine(119, 26, 119, 112, WHITE);
  EPD_ShowString(131, 27, "AUTO RESET IN", BLACK, 12);

  char resetIn[20];
  copyDisplayAscii(resetIn, sizeof(resetIn), snapshot.resetInLabel);
  truncateAscii(resetIn, 18);
  const size_t resetInLength = strlen(resetIn);
  const uint16_t resetInSize = resetInLength <= 9 ? 24 : (resetInLength <= 13 ? 16 : 12);
  EPD_ShowString(131, 44, resetIn, BLACK, resetInSize);

  char resetAt[24];
  copyDisplayAscii(resetAt, sizeof(resetAt), snapshot.resetAtLabel);
  truncateAscii(resetAt, 18);
  EPD_ShowString(131, 72, resetAt, BLACK, 12);
  EPD_DrawLine(131, 86, 241, 86, WHITE);
  EPD_ShowString(131, 96, "FULL RESETS", BLACK, 12);
  drawCredits(snapshot);
}

void acknowledge(uint64_t generatedAt) {
  JsonDocument response;
  response["schemaVersion"] = 1;
  response["type"] = "codex_usage_ack";
  response["generatedAt"] = generatedAt;
  response["status"] = "displayed";
  serializeJson(response, Serial);
  Serial.write('\n');
}

void handleLine(const char *line) {
  JsonDocument document;
  const DeserializationError error = deserializeJson(document, line);
  if (error) return;

  DisplaySnapshot snapshot{};
  if (!decodeSnapshot(document, snapshot)) return;

  // The screen and its power rail remain untouched until this point. A boot,
  // cable reconnect, or malformed line therefore cannot erase the retained
  // e-paper frame.
  // A previous refresh leaves the e-paper controller in deep sleep. Fully
  // cycle its dedicated power rail before every render so each update starts
  // from the same controller and waveform state.
  pinMode(DISPLAY_POWER_PIN, OUTPUT);
  digitalWrite(DISPLAY_POWER_PIN, LOW);
  delay(100);
  digitalWrite(DISPLAY_POWER_PIN, HIGH);
  delay(100);
  renderSnapshot(snapshot);
  EPD_Init();
  const bool usePartialRefresh = hasPreviousFrame
    && partialRefreshesSinceFull < PARTIAL_REFRESHES_BEFORE_FULL;
  if (usePartialRefresh) {
    EPD_DisplayTransition(PreviousImageBW, ImageBW);
  } else {
    EPD_DisplayImage(ImageBW);
  }
  EPD_Update();
  EPD_Sleep();
  memcpy(PreviousImageBW, ImageBW, ALLSCREEN_BYTES);
  hasPreviousFrame = true;
  partialRefreshesSinceFull = usePartialRefresh
    ? partialRefreshesSinceFull + 1
    : 0;
  delay(25);
  digitalWrite(DISPLAY_POWER_PIN, LOW);
  acknowledge(snapshot.generatedAt);
}

void setup() {
  Serial.begin(SERIAL_BAUD);
  // Keep the factory status LED dark. This pin does not power the ESP32 or the
  // e-paper panel; Elecrow's factory sketch labels it POWER LED.
  pinMode(POWER_LED_PIN, OUTPUT);
  digitalWrite(POWER_LED_PIN, LOW);
  pinMode(DISPLAY_POWER_PIN, OUTPUT);
  digitalWrite(DISPLAY_POWER_PIN, LOW);
}

void loop() {
  while (Serial.available() > 0) {
    const char value = static_cast<char>(Serial.read());
    if (value == '\n') {
      if (!discardingOversizeLine && serialLineLength > 0) {
        serialLine[serialLineLength] = '\0';
        handleLine(serialLine);
      }
      serialLineLength = 0;
      discardingOversizeLine = false;
    } else if (value != '\r' && !discardingOversizeLine) {
      if (serialLineLength < MAX_LINE_BYTES) {
        serialLine[serialLineLength++] = value;
      } else {
        serialLineLength = 0;
        discardingOversizeLine = true;
      }
    }
  }
  delay(2);
}
