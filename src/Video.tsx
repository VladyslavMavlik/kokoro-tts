import React from 'react';
import {Composition, Sequence, staticFile, Audio} from 'remotion';
import {Handheld} from './Handheld';

interface SlideshowProps {
  images: string[];
  audioDuration: number;
  audioPath: string;
}

const Slideshow: React.FC<SlideshowProps> = ({images, audioDuration, audioPath}) => {
  const fps = 30;
  const totalFrames = Math.ceil(audioDuration * fps);
  const framesPerImage = Math.floor(totalFrames / images.length);

  return (
    <>
      {/* Аудіо трек */}
      <Audio src={staticFile(audioPath)} />

      {/* Послідовність зображень з ручним покачуванням */}
      {images.map((image, index) => (
        <Sequence
          key={index}
          from={index * framesPerImage}
          durationInFrames={framesPerImage}
        >
          <Handheld src={staticFile(image)} />
        </Sequence>
      ))}
    </>
  );
};

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="HandheldSlideshow"
        component={Slideshow}
        durationInFrames={150} // Буде перевизначено динамічно
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{
          images: ['image1.jpg', 'image2.jpg'], // Плейсхолдер
          audioDuration: 5,
          audioPath: 'audio.mp3',
        }}
      />
    </>
  );
};