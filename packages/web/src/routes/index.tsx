import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { fetchMe } from "~/lib/session";

export const Route = createFileRoute("/")({
  component: HomeRedirect,
});

function HomeRedirect() {
  const me = useQuery({
    queryKey: ["me"],
    queryFn: fetchMe,
    retry: false,
  });

  if (me.isPending) {
    return (
      <div className="grid min-h-screen place-items-center text-mist">Loading workspace…</div>
    );
  }

  if (me.data) {
    return <Navigate to="/dashboards" />;
  }

  return <Navigate to="/login" />;
}
