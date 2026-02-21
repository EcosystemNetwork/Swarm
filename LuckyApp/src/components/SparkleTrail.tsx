"use client";

import dynamic from "next/dynamic";

const ClickSpark = dynamic(() => import("@/components/reactbits/ClickSpark"), { ssr: false });

export default function SparkleTrail({ children }: { children?: React.ReactNode }) {
  return (
    <ClickSpark
      sparkColor="#FFD700"
      sparkSize={12}
      sparkRadius={20}
      sparkCount={10}
      duration={500}
      easing="ease-out"
      extraScale={1.2}
    >
      {children}
    </ClickSpark>
  );
}
