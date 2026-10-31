import { Link, useRoute } from "./blocks/router";
import { ErrorBoundary, Screen } from "./blocks/ui";
import { pages } from "./pages";

// The page for the first part of the URL: #/checkin/student opens pages.checkin. Anything pages
// doesn't list shows "No page at #/...": a typo, a name every object has (#/constructor,
// #/hasOwnProperty), or a path with a bad %-escape (useRoute gives it as one part). A page that
// throws while it renders shows "Something went wrong." with Reload and Go home, never a blank
// screen (ErrorBoundary).
export default function App() {
  const parts = useRoute();
  const first = parts[0] ?? "";
  // hasOwnProperty, not Object.hasOwn, which iPads before iOS 15.4 don't have.
  const Page = Object.prototype.hasOwnProperty.call(pages, first) ? pages[first] : undefined;
  if (!Page)
    return (
      <Screen title={`No page at #/${parts.join("/")}`}>
        <p>
          <Link to="">Go home</Link>
        </p>
      </Screen>
    );
  return (
    <ErrorBoundary page>
      <Page />
    </ErrorBoundary>
  );
}
