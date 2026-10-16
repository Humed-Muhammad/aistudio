import { createContext, useContext } from "react";
import { Lottie } from "@remotion/lottie";
import type { LottieAnimationData } from "@remotion/lottie";

/** Google's Noto animated emoji (Lottie), keyed by the emoji, supplied by shorts.py in the props. */
export const LottieEmoji = createContext<Record<string, LottieAnimationData>>(
  {},
);

/** An emoji that moves when an animation exists for it, else the plain character. */
export const Emoji: React.FC<{ emoji: string; size: number }> = ({
  emoji,
  size,
}) => {
  const animations = useContext(LottieEmoji);
  const data = animations[emoji];
  if (data)
    return (
      <Lottie animationData={data} loop style={{ width: size, height: size }} />
    );
  return (
    <span style={{ fontSize: size * 0.82, lineHeight: 1, display: "block" }}>
      {emoji}
    </span>
  );
};
