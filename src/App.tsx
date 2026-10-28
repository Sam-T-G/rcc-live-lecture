import { useRoute } from "./blocks/router";
import { pages } from "./pages";

export default function App() {
  const [first = ""] = useRoute();
  const Page = pages[first];
  if (!Page)
    return (
      <main className="page">
        <h1>No page at #/{first}</h1>
        <p>
          <a href="#/">Go home</a>
        </p>
      </main>
    );
  return <Page />;
}
