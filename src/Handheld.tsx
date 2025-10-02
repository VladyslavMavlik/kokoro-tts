import {Img, useCurrentFrame, useVideoConfig} from 'remotion';

export const Handheld: React.FC<{src: string}> = ({src}) => {
  const frame = useCurrentFrame();
  const {fps, width, height} = useVideoConfig();
  const t = frame / fps;

  // легке «дихання» + покачування
  const x = 16*(Math.sin(2*Math.PI*0.07*t) + 0.4*Math.sin(2*Math.PI*0.11*t));
  const y = 10*(Math.cos(2*Math.PI*0.06*t) + 0.3*Math.cos(2*Math.PI*0.09*t));
  const scale = 1.02 + 0.01*Math.sin(2*Math.PI*0.05*t); // +2% запас

  return (
    <div style={{width, height, overflow:'hidden', background:'black'}}>
      <Img src={src}
        style={{
          width: width*1.2, height: 'auto', transformOrigin:'50% 50%',
          transform: `translate(${x}px, ${y}px) scale(${scale})`
        }}/>
    </div>
  );
};