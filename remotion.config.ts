import { Config } from '@remotion/cli/config';

// Налаштування для H.264 відео
Config.setVideoImageFormat('jpeg');
Config.setPixelFormat('yuv420p');
Config.setCodec('h264');
Config.setCrf(18); // Висока якість

// Налаштування для швидкого рендерингу на M1
Config.setChromiumOpenGlRenderer('egl');
Config.setConcurrency(4); // Використовуємо 4 ядра паралельно

// GIF налаштування видалені - конфліктують з H.264