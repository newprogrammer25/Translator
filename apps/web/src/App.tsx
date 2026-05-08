import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";

const RealtimeMode = lazy(() => import("./modes/RealtimeMode").then((m) => ({ default: m.RealtimeMode })));
const TranslationMode = lazy(() => import("./modes/TranslationMode").then((m) => ({ default: m.TranslationMode })));
const DialogueMode = lazy(() => import("./modes/DialogueMode").then((m) => ({ default: m.DialogueMode })));
const CallMode = lazy(() => import("./modes/CallMode").then((m) => ({ default: m.CallMode })));

function Loading() {
  return (
    <div className="flex items-center justify-center py-24 text-ink-500 text-sm">Loading…</div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route
          index
          element={
            <Suspense fallback={<Loading />}>
              <RealtimeMode />
            </Suspense>
          }
        />
        <Route
          path="translate"
          element={
            <Suspense fallback={<Loading />}>
              <TranslationMode />
            </Suspense>
          }
        />
        <Route
          path="dialogue"
          element={
            <Suspense fallback={<Loading />}>
              <DialogueMode />
            </Suspense>
          }
        />
        <Route
          path="call"
          element={
            <Suspense fallback={<Loading />}>
              <CallMode />
            </Suspense>
          }
        />
      </Route>
    </Routes>
  );
}
