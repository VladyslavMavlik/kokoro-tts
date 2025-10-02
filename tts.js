import { KokoroTTS } from "kokoro-js";

const model_id = "onnx-community/Kokoro-82M-v1.0-ONNX";

// 1) ініціалізація моделі (перший запуск завантажить ваги, це нормально)
const tts = await KokoroTTS.from_pretrained(model_id, {
  dtype: "q8",   // "q8"/"q4" — швидко і економно; "fp16"/"fp32" — якісніше, повільніше
  device: "cpu", // у Node використовуємо CPU
});

// 2) синтез
const text = "Life is like a box of chocolates. You never know what you're gonna get.";
const audio = await tts.generate(text, {
  voice: "af_bella", // список голосів: await tts.list_voices()
  // sample_rate: 24000, // необов'язково
});

// 3) збереження
await audio.save("audio.wav");
console.log("✔ Saved: audio.wav");
