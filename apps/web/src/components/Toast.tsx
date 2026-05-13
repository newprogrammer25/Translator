import { Check, AlertTriangle, Info, X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

type ToastType = "success" | "error" | "info";

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const toast = useCallback((message: string, type: ToastType = "success") => {
    const id = ++idRef.current;
    setToasts((prev) => [...prev, { id, message, type }]);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="toast-container">
        {toasts.map((t) => (
          <ToastNotification key={t.id} item={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastNotification({
  item,
  onDismiss,
}: {
  item: ToastItem;
  onDismiss: (id: number) => void;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setVisible(true));
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(() => onDismiss(item.id), 220);
    }, 3200);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [item.id, onDismiss]);

  const icons: Record<ToastType, ReactNode> = {
    success: <Check className="w-4 h-4 text-teal-300" />,
    error: <AlertTriangle className="w-4 h-4 text-rose-300" />,
    info: <Info className="w-4 h-4 text-violet-300" />,
  };

  const rings: Record<ToastType, string> = {
    success: "ring-teal-400/20",
    error: "ring-rose-400/20",
    info: "ring-violet-400/20",
  };

  return (
    <div
      role="alert"
      className={`pointer-events-auto flex items-center gap-3 rounded-2xl px-4 py-3 
        bg-canvas-900/95 backdrop-blur-2xl ring-1 ${rings[item.type]} 
        shadow-lg max-w-sm w-full
        transition-all duration-220 ease-premium
        ${visible ? "opacity-100 translate-y-0 scale-100" : "opacity-0 translate-y-3 scale-95"}`}
    >
      <span className="shrink-0">{icons[item.type]}</span>
      <span className="flex-1 text-sm text-ink-100 font-medium leading-tight">{item.message}</span>
      <button
        type="button"
        onClick={() => {
          setVisible(false);
          setTimeout(() => onDismiss(item.id), 220);
        }}
        className="shrink-0 text-ink-500 hover:text-white transition-colors rounded-full p-1"
        aria-label="Dismiss"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
