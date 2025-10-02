import {Img, useCurrentFrame, useVideoConfig, staticFile} from 'remotion';

export const PersonOverlay: React.FC<{personSrc: string}> = ({personSrc}) => {
  const frame = useCurrentFrame();
  const {fps, width, height} = useVideoConfig();
  const t = frame / fps;

  // Швидший незалежний рух камери для жінки
  const personX = 20*(Math.sin(2*Math.PI*0.12*t) + 0.5*Math.sin(2*Math.PI*0.15*t));
  const personY = 15*(Math.cos(2*Math.PI*0.10*t) + 0.4*Math.cos(2*Math.PI*0.13*t));
  const personScale = 1.03 + 0.015*Math.sin(2*Math.PI*0.08*t); // більше дихання

  return (
    <div style={{
      position: 'absolute',
      left: '10%', // зміщення в ліву частину
      top: '0%',
      width: '50%', // більший розмір жінки
      height: '100%', // на всю висоту
      transform: `translate(${personX}px, ${personY}px) scale(${personScale})`,
      transformOrigin: 'center bottom', // якір знизу
      zIndex: 10, // поверх слайдів, але під FX
    }}>
      {/* Тінь під жінкою */}
      <div style={{
        position: 'absolute',
        bottom: '5%',
        left: '50%',
        width: '80%',
        height: '25px',
        backgroundColor: 'rgba(0,0,0,0.4)',
        borderRadius: '50%',
        transform: 'translateX(-50%)',
        filter: 'blur(12px)',
        zIndex: 0,
      }} />

      {/* Сама жінка */}
      <Img
        src={staticFile(personSrc)}
        style={{
          width: width * 1.2, // 1920*1.2 = 2304px запас для руху
          height: 'auto',
          objectFit: 'contain',
          objectPosition: 'center bottom',
          zIndex: 1,
          position: 'relative',
          transform: 'translateX(-10%)', // центруємо з урахуванням запасу
        }}
      />
    </div>
  );
};