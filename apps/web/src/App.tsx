import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Skeleton } from "./components/Skeleton";
import { ToastProvider } from "./components/Toast";

const RealtimeMode = lazy(() => import("./modes/RealtimeMode").then((m) => ({ default: m.RealtimeMode })));
const TranslationMode = lazy(() => import("./modes/TranslationMode").then((m) => ({ default: m.TranslationMode })));
const DialogueMode = lazy(() => import("./modes/DialogueMode").then((m) => ({ default: m.DialogueMode })));
const CallMode = lazy(() => import("./modes/CallMode").then((m) => ({ default: m.CallMode })));

export default function App() {
  return (
    <ToastProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route
            index
            element={
              <Suspense fallback={<Skeleton />}>
                <RealtimeMode />
              </Suspense>
            }
          />
          <Route
            path="translate"
            element={
              <Suspense fallback={<Skeleton />}>
                <TranslationMode />
              </Suspense>
            }
          />
          <Route
            path="dialogue"
            element={
              <Suspense fallback={<Skeleton />}>
                <DialogueMode />
              </Suspense>
            }
          />
          <Route
            path="call"
            element={
              <Suspense fallback={<Skeleton />}>
                <CallMode />
              </Suspense>
            }
          />
        </Route>
      </Routes>
    </ToastProvider>
  );
}
