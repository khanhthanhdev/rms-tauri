import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

interface HealthResponse {
  database: string;
  host: string;
  port: number;
  startedAt: string;
  status: string;
}

interface CounterResponse {
  value: number;
}

const fetchJson = async <TData,>(
  resource: string,
  init?: RequestInit
): Promise<TData> => {
  const response = await fetch(resource, init);

  if (!response.ok) {
    throw new Error(`Request failed for ${resource} (${response.status})`);
  }

  return (await response.json()) as TData;
};

export const Route = createFileRoute("/")({
  component: HomeComponent,
});

function HomeComponent() {
  const queryClient = useQueryClient();

  const healthQuery = useQuery({
    queryKey: ["health"],
    queryFn: () => fetchJson<HealthResponse>("/api/health"),
  });

  const counterQuery = useQuery({
    queryKey: ["counter"],
    queryFn: () => fetchJson<CounterResponse>("/api/counter"),
  });

  const incrementMutation = useMutation({
    mutationFn: () =>
      fetchJson<CounterResponse>("/api/counter/increment", {
        method: "POST",
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["counter"] });
    },
  });

  return (
    <main className="page">
      <article>
        <h1>RMS Local Sidecar Starter</h1>
        <p>
          This UI runs in your browser while Tauri launches a Bun sidecar and
          initializes SQLite.
        </p>
      </article>

      <section>
        <h2>Server Health</h2>
        {healthQuery.isPending ? <p>Checking server...</p> : null}
        {healthQuery.error ? (
          <p role="alert">{healthQuery.error.message}</p>
        ) : null}
        {healthQuery.data ? (
          <dl>
            <dt>Status</dt>
            <dd>{healthQuery.data.status}</dd>

            <dt>Host</dt>
            <dd>
              {healthQuery.data.host}:{healthQuery.data.port}
            </dd>

            <dt>Database</dt>
            <dd>{healthQuery.data.database}</dd>

            <dt>Started At</dt>
            <dd>{healthQuery.data.startedAt}</dd>
          </dl>
        ) : null}
      </section>

      <section>
        <h2>SQLite Counter</h2>
        {counterQuery.isPending ? <p>Loading counter...</p> : null}
        {counterQuery.error ? (
          <p role="alert">{counterQuery.error.message}</p>
        ) : null}

        {counterQuery.data ? (
          <p>Current value: {counterQuery.data.value}</p>
        ) : null}

        <button
          className="primary"
          disabled={incrementMutation.isPending}
          onClick={() => {
            incrementMutation.mutate();
          }}
          type="button"
        >
          {incrementMutation.isPending ? "Incrementing..." : "Increment"}
        </button>
      </section>
    </main>
  );
}
