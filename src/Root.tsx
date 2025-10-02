import React from 'react';
import {Composition, Sequence, staticFile, Audio, registerRoot} from 'remotion';
import {Handheld} from './Handheld';

const Slideshow: React.FC<{
  images: string[];
  audioDuration: number;
  audioPath: string;
}> = ({images, audioDuration, audioPath}) => {
  const fps = 30;
  const totalFrames = Math.ceil(audioDuration * fps);
  const framesPerImage = Math.floor(totalFrames / images.length);

  return (
    <>
      <Audio src={staticFile(audioPath)} />
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

const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="HandheldSlideshow"
        component={Slideshow}
        durationInFrames={150}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{
          images: ['image1.jpg'],
          audioDuration: 5,
          audioPath: 'audio.mp3',
        }}
      />
    </>
  );
};

registerRoot(RemotionRoot);