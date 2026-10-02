import { Suspense } from "react";
import { SummaryApp } from "@/components/app/summary-app";

export default function Home() {
  return (
    <Suspense>
      <SummaryApp />
    </Suspense>
  );
}
