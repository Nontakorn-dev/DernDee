import { Navigate, useSearchParams } from "react-router-dom";

export function OpenPlainMap() {
  const [params] = useSearchParams();
  const query = params.toString();
  return <Navigate to={query ? `/game/trail?${query}` : "/game/trail"} replace />;
}

export function OpenPlainPlay() {
  const [params] = useSearchParams();
  const query = params.toString();
  return <Navigate to={query ? `/play?${query}` : "/play"} replace />;
}
