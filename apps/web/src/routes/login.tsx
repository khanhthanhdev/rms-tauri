import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/login")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <main className="page">
      <article>
        <h1>Login Placeholder</h1>
        <p>This starter focuses on sidecar launch and local APIs first.</p>
        <p>
          Continue to <Link to="/">home</Link>.
        </p>
      </article>
    </main>
  );
}
