import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <main className="page">
      <article>
        <h1>Dashboard Placeholder</h1>
        <p>API integration is available on the home page for now.</p>
        <p>
          Return to <Link to="/">home</Link>.
        </p>
      </article>
    </main>
  );
}
