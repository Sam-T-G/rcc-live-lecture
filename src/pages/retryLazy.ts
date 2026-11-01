// A React.lazy that can load again after a failed import. React.lazy keeps a failed import and
// throws the same error on every later render, so an ErrorBoundary's Try again could never bring
// the part back without a page reload (for example after a deploy deleted the old chunk, or on a
// phone that was offline for a moment). retryLazy(load) returns `pick`: call it once per mount
// (`const [C] = useState(pick)`) to get the component. After an import fails, the next pick builds
// a new lazy component that runs `load` again; until then every pick returns the same one, so a
// part that loaded never imports twice.
import { lazy, type ComponentType } from "react";

export function retryLazy<P extends object>(load: () => Promise<{ default: ComponentType<P> }>) {
  let failed = false;
  const make = () =>
    lazy(() =>
      load().catch((e: unknown) => {
        failed = true;
        throw e;
      }),
    );
  let current = make();
  return () => {
    if (failed) {
      failed = false;
      current = make();
    }
    return current;
  };
}
