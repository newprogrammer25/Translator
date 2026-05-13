import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";

interface Props {
  children: ReactNode;
}

/**
 * Lightweight page transition wrapper.
 * Fades out/in on route change — no external animation library needed.
 */
export function PageTransition({ children }: Props) {
  const location = useLocation();
  const [displayChildren, setDisplayChildren] = useState(children);
  const [stage, setStage] = useState<"enter" | "exit">("enter");
  const prevKey = useRef(location.pathname);

  useEffect(() => {
    if (location.pathname !== prevKey.current) {
      prevKey.current = location.pathname;
      setStage("exit");
    }
  }, [location.pathname]);

  useEffect(() => {
    if (stage === "exit") {
      const t = setTimeout(() => {
        setDisplayChildren(children);
        setStage("enter");
      }, 180);
      return () => clearTimeout(t);
    }
  }, [stage, children]);

  useEffect(() => {
    if (stage === "enter") {
      setDisplayChildren(children);
    }
  }, [children, stage]);

  return (
    <div className={`page-transition ${stage === "enter" ? "page-enter" : "page-exit"}`}>
      {displayChildren}
    </div>
  );
}
