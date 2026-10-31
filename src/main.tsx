import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ConvexReactClient } from "convex/react";
import { AuthProvider } from "./blocks/auth";
import { ErrorBoundary } from "./blocks/ui";
import App from "./App";
import "./index.css";

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);

// App.tsx catches an error in a page. This boundary catches one in the sign-in and Convex
// providers around it, so the screen says "Something went wrong." instead of going blank.
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary page>
      <AuthProvider client={convex}>
        <App />
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>,
);
