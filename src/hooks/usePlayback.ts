import { useEffect, useRef, useState } from 'react';

export function usePlayback(
  length: number,
  duration: number,
  playing: boolean,
  speed = 1,
) {
  const [frame, setFrame] = useState(0);
  const frameRef = useRef(0);
  const startedAt = useRef<number | null>(null);
  const originFrame = useRef(0);

  useEffect(() => {
    setFrame(0);
    frameRef.current = 0;
    startedAt.current = null;
    originFrame.current = 0;
  }, [length, duration]);

  useEffect(() => {
    if (!playing || length <= 1 || duration <= 0 || speed <= 0) {
      startedAt.current = null;
      originFrame.current = frameRef.current;
      return;
    }

    const lastFrame = length - 1;
    startedAt.current = null;
    originFrame.current = frameRef.current;
    let animationFrame = 0;
    const render = (now: number) => {
      if (startedAt.current === null) startedAt.current = now;
      const elapsed = ((now - startedAt.current) / 1_000) * speed;
      const originPhase = originFrame.current / lastFrame;
      const phase = (originPhase + elapsed / duration) % 1;
      const next = Math.min(lastFrame, Math.round(phase * lastFrame));
      if (next !== frameRef.current) {
        frameRef.current = next;
        setFrame(next);
      }
      animationFrame = requestAnimationFrame(render);
    };
    animationFrame = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animationFrame);
  }, [duration, length, playing, speed]);

  const scrub = (next: number) => {
    const bounded = Math.max(0, Math.min(Math.max(0, length - 1), Math.round(next)));
    frameRef.current = bounded;
    originFrame.current = bounded;
    startedAt.current = null;
    setFrame(bounded);
  };

  return { frame, setFrame: scrub };
}
