/**
 * Premium skeleton loading — mimics page structure while lazy chunks load.
 */
export function Skeleton() {
  return (
    <div className="flex flex-col gap-8 animate-fade-up">
      {/* Hero area */}
      <div className="flex flex-col gap-3">
        <div className="skeleton h-3 w-20 rounded-full" />
        <div className="skeleton h-11 w-80 max-w-full rounded-2xl" />
        <div className="skeleton h-11 w-60 max-w-full rounded-2xl" />
        <div className="skeleton h-4 w-96 max-w-full rounded-full mt-1" />
      </div>

      {/* Language selector area */}
      <div className="flex items-center gap-3">
        <div className="skeleton h-11 flex-1 rounded-full" />
        <div className="skeleton h-9 w-9 rounded-full shrink-0" />
        <div className="skeleton h-11 flex-1 rounded-full" />
      </div>

      {/* Content panes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="skeleton-surface rounded-3xl p-7 min-h-[280px] flex flex-col gap-4">
          <div className="skeleton h-3 w-14 rounded-full" />
          <div className="flex flex-col gap-3 flex-1 pt-2">
            <div className="skeleton h-5 w-full rounded-full" />
            <div className="skeleton h-5 w-[85%] rounded-full" />
            <div className="skeleton h-5 w-[60%] rounded-full" />
          </div>
          <div className="flex items-center gap-2 justify-end pt-2">
            <div className="skeleton h-7 w-16 rounded-full" />
            <div className="skeleton h-7 w-16 rounded-full" />
          </div>
        </div>
        <div className="skeleton-surface rounded-3xl p-7 min-h-[280px] flex flex-col gap-4">
          <div className="skeleton h-3 w-20 rounded-full" />
          <div className="flex flex-col gap-3 flex-1 pt-2">
            <div className="skeleton h-5 w-full rounded-full" />
            <div className="skeleton h-5 w-[75%] rounded-full" />
            <div className="skeleton h-5 w-[50%] rounded-full" />
          </div>
          <div className="flex items-center gap-2 justify-end pt-2">
            <div className="skeleton h-7 w-16 rounded-full" />
            <div className="skeleton h-7 w-16 rounded-full" />
          </div>
        </div>
      </div>
    </div>
  );
}
