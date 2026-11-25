import { createMotion, effect, reduceMotion, token, View } from "nsh";

/** Staggered native dots for ongoing work or a pending reply. */
export function PulsingDots(props: { color?: string; testID: string }) {
  const dots = [0, 1, 2].map(() => createMotion({ initial: { opacity: 0.35, scale: 0.55 } }));
  effect(() => {
    const small = reduceMotion() ? 0.7 : 0.55;
    const large = reduceMotion() ? 0.7 : 1;
    dots.forEach((dot, index) => {
      void dot.play({
        keyframes: [
          { offset: 0, opacity: 0.35, scale: small },
          { offset: 0.25, opacity: 0.85, scale: large },
          { offset: 0.5, opacity: 0.35, scale: small },
          { offset: 1, opacity: 0.35, scale: small },
        ],
        duration: 1200,
        delay: index * 160,
        iterations: "infinite",
        // Reduced motion keeps the dots at a fixed size.
        ignoreReduceMotion: true,
      });
    });
    return () => dots.forEach((dot) => dot.stop());
  });

  return <View testID={props.testID} class="shrink-0 flex-row items-center gap-0.5">
    {dots.map((dot, index) => <View testID={`${props.testID}-${index}`} class="size-2 rounded-full" style={{ ...dot.style, backgroundColor: props.color ?? token("primary") }} />)}
  </View>;
}
