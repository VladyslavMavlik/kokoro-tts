import React from 'react';
import {Composition, Sequence, staticFile, Audio, registerRoot} from 'remotion';
import {Handheld} from './Handheld';
import {PersonOverlay} from './PersonOverlay';

const Slideshow: React.FC = () => {
  const images = ['1.jpg', '2.jpg', '3.jpg', '4.jpg', '5.jpg', '6.jpg', '7.jpg'];
  const audioDuration = 1436.6;
  const audioPath = 'voice.mp3';
  const personSrc = 'remove-background.png';

  const fps = 30;
  const totalFrames = Math.ceil(audioDuration * fps);
  const framesPerImage = Math.floor(totalFrames / images.length);

  return (
    <>
      <Audio src={staticFile(audioPath)} />

      {/* Слайди фонових зображень */}
      {images.map((image, index) => (
        <Sequence
          key={index}
          from={index * framesPerImage}
          durationInFrames={framesPerImage}
        >
          <Handheld src={staticFile(image)} />
        </Sequence>
      ))}

      {/* Жінка як окремий шар поверх всіх слайдів */}
      {personSrc && (
        <Sequence
          from={0}
          durationInFrames={totalFrames}
        >
          <PersonOverlay personSrc={personSrc} />
        </Sequence>
      )}
    </>
  );
};

const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="HandheldSlideshow"
        component={Slideshow}
        durationInFrames={43098}
        fps={30}
        width={1920}
        height={1080}
      />
    </>
  );
};

registerRoot(RemotionRoot);